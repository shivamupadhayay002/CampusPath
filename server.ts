import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';
import { db } from './src/db/index.ts';
import {
  auditLogs,
  blocks,
  colleges,
  comments,
  conversationMembers,
  conversations,
  follows,
  likes,
  messages,
  notifications,
  postAttachments,
  posts,
  reports,
  savedPosts,
  users,
  verificationRequests,
} from './src/db/schema.ts';
import { ensureSeedData } from './src/db/seed.ts';
import {
  getConfiguredBootstrapAdminEmail,
  validateCollegeDomain,
} from './src/db/users.ts';
import {
  AuthRequest,
  optionalAuth,
  requireAuth,
  requireRole,
  requireVerified,
} from './src/middleware/auth.ts';

dotenv.config();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function isPgUniqueViolation(error: unknown, constraintName?: string): boolean {
  const errObj = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = errObj?.code || errObj?.cause?.code;
  const constraint = errObj?.constraint || errObj?.cause?.constraint;
  if (code !== '23505') return false;
  if (constraintName && constraint && constraint !== constraintName) return false;
  return true;
}

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Simple in-memory rate limit store (per-user action window)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

// Magic-byte file signature validator (never trust filename or browser MIME alone)
function detectFileSignature(buffer: Buffer): { mime: string; kind: 'image' | 'document'; ext: string } | null {
  if (buffer.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', kind: 'image', ext: '.png' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image', ext: '.jpg' };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', kind: 'image', ext: '.webp' };
  }

  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', kind: 'document', ext: '.pdf' };
  }

  // DOCX / PPTX / XLSX (OpenXML ZIP): PK\x03\x04
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return {
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'document',
      ext: '.docx',
    };
  }

  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 3,
  },
});

const ALLOWED_CATEGORIES = new Set([
  'study_materials',
  'jobs_internships',
  'student_stories',
  'interview_prep',
  'projects_events',
  'announcements',
]);

function sanitizePublicProfile(
  user: typeof users.$inferSelect,
  viewer?: typeof users.$inferSelect | null
) {
  const isSelf = viewer?.id === user.id;
  const isAdmin = viewer?.role === 'admin';
  const privacy = user.privacySettings || {
    showEmail: false,
    showLinkedIn: true,
    showAcademicYear: true,
    allowMessagesFrom: 'college',
  };

  const isVerifiedSameCollegeViewer =
    Boolean(viewer) &&
    viewer!.verificationStatus === 'verified' &&
    viewer!.collegeId !== null &&
    user.collegeId !== null &&
    viewer!.collegeId === user.collegeId;

  const canViewPrivateEmail =
    isSelf || isAdmin || (privacy.showEmail && isVerifiedSameCollegeViewer);

  return {
    id: user.id,
    displayName: user.displayName,
    headline: user.headline,
    role: user.role,
    verificationStatus: user.verificationStatus,
    collegeId: user.collegeId,
    branch: user.branch,
    academicYear:
      isSelf || isAdmin || privacy.showAcademicYear ? user.academicYear : '',
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    linkedinUrl:
      isSelf || isAdmin || privacy.showLinkedIn ? user.linkedinUrl : '',
    email: canViewPrivateEmail ? user.email : undefined,
    collegeEmail: canViewPrivateEmail ? user.collegeEmail : undefined,
    skills: user.skills,
    projects: user.projects,
    achievements: user.achievements,
    privacySettings: isSelf ? privacy : undefined,
    isRestricted: isAdmin ? user.isRestricted : undefined,
    createdAt: user.createdAt,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Lazy seed middleware on API requests
  app.use('/api', async (_req, _res, next) => {
    await ensureSeedData();
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/colleges', async (_req, res) => {
    try {
      const list = await db
        .select()
        .from(colleges)
        .where(eq(colleges.status, 'active'))
        .orderBy(colleges.id);
      res.json(list);
    } catch (error) {
      console.error('Error loading colleges:', error);
      res.status(500).json({ error: 'Unable to load colleges.' });
    }
  });

  // Current user profile + counts
  app.get('/api/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const [college] = me.collegeId
        ? await db.select().from(colleges).where(eq(colleges.id, me.collegeId)).limit(1)
        : [];

      const unreadNotifs = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.recipientId, me.id), eq(notifications.isRead, false)));

      const followerRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followingId, me.id));

      const followingRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followerId, me.id));

      res.json({
        user: sanitizePublicProfile(me, me),
        college: college ?? null,
        unreadNotifications: unreadNotifs[0]?.count ?? 0,
        followersCount: followerRows[0]?.count ?? 0,
        followingCount: followingRows[0]?.count ?? 0,
      });
    } catch (error) {
      console.error('Error fetching /api/me:', error);
      res.status(500).json({ error: 'Unable to fetch your profile.' });
    }
  });

  app.patch('/api/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const body = req.body || {};

      const displayName =
        typeof body.displayName === 'string' && body.displayName.trim().length >= 2
          ? body.displayName.trim().slice(0, 80)
          : me.displayName;
      const headline =
        typeof body.headline === 'string'
          ? body.headline.trim().slice(0, 140)
          : me.headline;
      const branch =
        typeof body.branch === 'string' ? body.branch.trim().slice(0, 80) : me.branch;
      const academicYear =
        typeof body.academicYear === 'string'
          ? body.academicYear.trim().slice(0, 60)
          : me.academicYear;
      const bio =
        typeof body.bio === 'string' ? body.bio.trim().slice(0, 800) : me.bio;
      const linkedinUrl =
        typeof body.linkedinUrl === 'string'
          ? body.linkedinUrl.trim().slice(0, 200)
          : me.linkedinUrl;
      const skills = Array.isArray(body.skills)
        ? body.skills
            .filter((s: unknown): s is string => typeof s === 'string')
            .map((s: string) => s.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 20)
        : me.skills;
      const projects = Array.isArray(body.projects)
        ? body.projects.slice(0, 10)
        : me.projects;
      const achievements = Array.isArray(body.achievements)
        ? body.achievements.slice(0, 15)
        : me.achievements;
      const privacySettings =
        body.privacySettings && typeof body.privacySettings === 'object'
          ? {
              showEmail: Boolean(body.privacySettings.showEmail),
              showLinkedIn: Boolean(body.privacySettings.showLinkedIn),
              showAcademicYear: Boolean(body.privacySettings.showAcademicYear),
              allowMessagesFrom:
                body.privacySettings.allowMessagesFrom === 'followers'
                  ? ('followers' as const)
                  : ('college' as const),
            }
          : me.privacySettings;

      const [updated] = await db
        .update(users)
        .set({
          displayName,
          headline,
          branch,
          academicYear,
          bio,
          linkedinUrl,
          skills,
          projects,
          achievements,
          privacySettings,
          updatedAt: new Date(),
        })
        .where(eq(users.id, me.id))
        .returning();

      res.json({ user: sanitizePublicProfile(updated, updated) });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Unable to update profile.' });
    }
  });

  app.delete('/api/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      await db.delete(users).where(eq(users.id, me.id));
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ error: 'Unable to delete account.' });
    }
  });

  // Verification workflow
  app.get('/api/verification/status', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const latest = await db
        .select({
          id: verificationRequests.id,
          userId: verificationRequests.userId,
          collegeId: verificationRequests.collegeId,
          requestedRole: verificationRequests.requestedRole,
          collegeEmail: verificationRequests.collegeEmail,
          method: verificationRequests.method,
          evidenceNote: verificationRequests.evidenceNote,
          status: verificationRequests.status,
          reviewNotes: verificationRequests.reviewNotes,
          createdAt: verificationRequests.createdAt,
          reviewedAt: verificationRequests.reviewedAt,
        })
        .from(verificationRequests)
        .where(eq(verificationRequests.userId, me.id))
        .orderBy(desc(verificationRequests.createdAt))
        .limit(1);

      const latestSafe = latest[0]
        ? {
            ...latest[0],
            evidenceNote:
              latest[0].status === 'pending'
                ? latest[0].evidenceNote
                : '[Redacted after decision]',
          }
        : null;

      res.json({
        verificationStatus: me.verificationStatus,
        latestRequest: latestSafe,
      });
    } catch (error) {
      console.error('Error loading verification status:', error);
      res.status(500).json({ error: 'Unable to load verification status.' });
    }
  });

  app.post('/api/verification/email-code', requireAuth, async (_req: AuthRequest, res: Response) => {
    return res.status(503).json({
      error:
        'Self-service email OTP verification is temporarily disabled while transactional email delivery is being configured. Please use Admin Review or verify your institutional email via Firebase.',
      code: 'EMAIL_OTP_DISABLED',
    });
  });

  app.post('/api/verification/confirm-code', requireAuth, async (_req: AuthRequest, res: Response) => {
    return res.status(503).json({
      error:
        'Self-service email OTP verification is temporarily disabled while transactional email delivery is being configured. Please use Admin Review or verify your institutional email via Firebase.',
      code: 'EMAIL_OTP_DISABLED',
    });
  });

  app.post('/api/verification/request', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const { collegeId, requestedRole, collegeEmail, evidenceNote } = req.body || {};
      if (typeof evidenceNote !== 'string' || evidenceNote.trim().length < 10) {
        return res.status(400).json({
          error:
            'Please provide enrollment details (student ID number, department, or faculty directory reference).',
        });
      }

      const targetCollegeId = parsePositiveInt(collegeId ?? me.collegeId);
      if (!targetCollegeId) {
        return res.status(400).json({ error: 'Please select a valid college.' });
      }

      const safeRole =
        requestedRole === 'faculty' || requestedRole === 'alumni' ? requestedRole : 'student';
      const safeCollegeEmail =
        typeof collegeEmail === 'string' ? collegeEmail.trim().toLowerCase().slice(0, 120) : '';
      if (safeCollegeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeCollegeEmail)) {
        return res.status(400).json({ error: 'Enter a valid optional college email address.' });
      }

      const created = await db.transaction(async (tx) => {
        const [freshUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, me.id))
          .limit(1);
        if (!freshUser) {
          throw new HttpError(404, 'Account not found.');
        }
        if (freshUser.verificationStatus === 'verified') {
          throw new HttpError(400, 'Your account is already verified.');
        }

        const [targetCollege] = await tx
          .select()
          .from(colleges)
          .where(and(eq(colleges.id, targetCollegeId), eq(colleges.status, 'active')))
          .limit(1);
        if (!targetCollege) {
          throw new HttpError(400, 'Selected college does not exist or is currently inactive.');
        }

        const existingPending = await tx
          .select({ id: verificationRequests.id })
          .from(verificationRequests)
          .where(
            and(
              eq(verificationRequests.userId, me.id),
              eq(verificationRequests.status, 'pending')
            )
          )
          .limit(1);
        if (existingPending.length > 0) {
          throw new HttpError(
            409,
            'You already have a pending verification request awaiting admin review.',
            'PENDING_REQUEST_EXISTS'
          );
        }

        const [inserted] = await tx
          .insert(verificationRequests)
          .values({
            userId: me.id,
            collegeId: targetCollege.id,
            requestedRole: safeRole,
            collegeEmail: safeCollegeEmail,
            verificationCode: '',
            method: 'admin_review',
            evidenceNote: evidenceNote.trim().slice(0, 600),
            status: 'pending',
          })
          .returning({
            id: verificationRequests.id,
            userId: verificationRequests.userId,
            collegeId: verificationRequests.collegeId,
            requestedRole: verificationRequests.requestedRole,
            collegeEmail: verificationRequests.collegeEmail,
            method: verificationRequests.method,
            evidenceNote: verificationRequests.evidenceNote,
            status: verificationRequests.status,
            reviewNotes: verificationRequests.reviewNotes,
            createdAt: verificationRequests.createdAt,
            reviewedAt: verificationRequests.reviewedAt,
          });

        // Do NOT assign users.collegeId until an administrator approves the request.
        await tx
          .update(users)
          .set({
            verificationStatus: 'pending',
            updatedAt: new Date(),
          })
          .where(eq(users.id, me.id));

        return inserted;
      });

      res.status(201).json({ request: created });
    } catch (error) {
      if (error instanceof HttpError) {
        return res
          .status(error.status)
          .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      }
      if (isPgUniqueViolation(error, 'verification_requests_one_pending_per_user_idx')) {
        return res.status(409).json({
          error: 'You already have a pending verification request awaiting admin review.',
          code: 'PENDING_REQUEST_EXISTS',
        });
      }
      console.error('Error submitting verification request:', error);
      res.status(500).json({ error: 'Unable to submit verification request.' });
    }
  });

  // Feed & Posts
  app.get('/api/feed', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const viewer = req.currentUser;
      const isVerifiedMember = viewer?.verificationStatus === 'verified';
      const category = typeof req.query.category === 'string' ? req.query.category : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const authorIdParam = req.query.authorId ? Number(req.query.authorId) : null;
      const savedOnly = req.query.savedOnly === 'true';
      const followingOnly = req.query.followingOnly === 'true';
      const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      // Determine blocked & followed users for viewer
      let blockedUserIds: number[] = [];
      let followingIds: number[] = [];
      let savedIds: number[] = [];
      let likedIds: number[] = [];

      if (viewer) {
        const blockedRows = await db
          .select({ blockedId: blocks.blockedId })
          .from(blocks)
          .where(eq(blocks.blockerId, viewer.id));
        const blockedByRows = await db
          .select({ blockerId: blocks.blockerId })
          .from(blocks)
          .where(eq(blocks.blockedId, viewer.id));
        blockedUserIds = [
          ...blockedRows.map((b) => b.blockedId),
          ...blockedByRows.map((b) => b.blockerId),
        ];

        const followRows = await db
          .select({ followingId: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, viewer.id));
        followingIds = followRows.map((f) => f.followingId);

        const savedRows = await db
          .select({ postId: savedPosts.postId })
          .from(savedPosts)
          .where(eq(savedPosts.userId, viewer.id));
        savedIds = savedRows.map((s) => s.postId);

        const likeRows = await db
          .select({ postId: likes.postId })
          .from(likes)
          .where(eq(likes.userId, viewer.id));
        likedIds = likeRows.map((l) => l.postId);
      }

      if (savedOnly && (!viewer || savedIds.length === 0)) {
        return res.json({ items: [], hasMore: false, restrictedMode: !isVerifiedMember });
      }
      if (followingOnly && (!viewer || followingIds.length === 0)) {
        return res.json({ items: [], hasMore: false, restrictedMode: !isVerifiedMember });
      }

      const conditions: any[] = [eq(posts.isHidden, false)];

      // Strict membership boundary (fail closed if collegeId is missing for non-admin)
      if (!isVerifiedMember) {
        conditions.push(eq(posts.visibility, 'public_preview'));
      } else if (viewer && viewer.role !== 'admin') {
        if (viewer.collegeId !== null) {
          conditions.push(eq(posts.collegeId, viewer.collegeId));
        } else {
          conditions.push(eq(posts.visibility, 'public_preview'));
        }
      }

      if (category && ALLOWED_CATEGORIES.has(category)) {
        conditions.push(eq(posts.category, category));
      }

      if (authorIdParam && Number.isFinite(authorIdParam)) {
        conditions.push(eq(posts.authorId, authorIdParam));
      }

      if (savedOnly && savedIds.length > 0) {
        conditions.push(inArray(posts.id, savedIds));
      }

      if (followingOnly && followingIds.length > 0) {
        conditions.push(inArray(posts.authorId, followingIds));
      }

      if (q) {
        const pattern = `%${q}%`;
        conditions.push(
          or(
            ilike(posts.title, pattern),
            ilike(posts.content, pattern),
            ilike(posts.contextLabel, pattern),
            sql`array_to_string(${posts.tags}, ' ') ILIKE ${pattern}`
          )
        );
      }

      const rawPosts = await db
        .select()
        .from(posts)
        .where(and(...conditions))
        .orderBy(desc(posts.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rawPosts.length > limit;
      const pagePosts = rawPosts.slice(0, limit).filter(
        (p) => !blockedUserIds.includes(p.authorId)
      );

      if (pagePosts.length === 0) {
        return res.json({
          items: [],
          hasMore: false,
          restrictedMode: !isVerifiedMember,
        });
      }

      const authorIds = Array.from(new Set(pagePosts.map((p) => p.authorId)));
      const authorRows = await db
        .select()
        .from(users)
        .where(inArray(users.id, authorIds));
      const authorMap = new Map(authorRows.map((u) => [u.id, u]));

      const postIds = pagePosts.map((p) => p.id);
      const attachmentRows = await db
        .select()
        .from(postAttachments)
        .where(inArray(postAttachments.postId, postIds));

      const attachmentsByPost = new Map<number, typeof attachmentRows>();
      for (const att of attachmentRows) {
        const list = attachmentsByPost.get(att.postId) || [];
        list.push(att);
        attachmentsByPost.set(att.postId, list);
      }

      const items = pagePosts.map((post) => {
        const author = authorMap.get(post.authorId);
        return {
          ...post,
          author: author ? sanitizePublicProfile(author, viewer) : null,
          attachments: (attachmentsByPost.get(post.id) || []).map((a) => ({
            id: a.id,
            originalName: a.originalName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            kind: a.kind,
          })),
          isLiked: likedIds.includes(post.id),
          isSaved: savedIds.includes(post.id),
          isFollowingAuthor: followingIds.includes(post.authorId),
        };
      });

      res.json({
        items,
        hasMore,
        restrictedMode: !isVerifiedMember,
      });
    } catch (error) {
      console.error('Error loading feed:', error);
      res.status(500).json({ error: 'Unable to load campus feed.' });
    }
  });

  app.post(
    '/api/posts',
    requireAuth,
    requireVerified,
    upload.array('attachments', 3),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;
        if (!checkRateLimit(`create_post:${me.id}`, 10, 15 * 60 * 1000)) {
          return res.status(429).json({ error: 'Post rate limit reached. Please wait a few minutes.' });
        }

        const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
        const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
        const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
        const contextLabel =
          typeof req.body.contextLabel === 'string' ? req.body.contextLabel.trim().slice(0, 100) : '';
        const externalLink =
          typeof req.body.externalLink === 'string' ? req.body.externalLink.trim().slice(0, 250) : '';
        const visibility =
          req.body.visibility === 'public_preview' ? 'public_preview' : 'college';

        if (title.length < 3 || title.length > 160) {
          return res.status(400).json({ error: 'Title must be between 3 and 160 characters.' });
        }
        if (content.length < 10 || content.length > 8000) {
          return res.status(400).json({ error: 'Post content must be between 10 and 8,000 characters.' });
        }
        if (!ALLOWED_CATEGORIES.has(category)) {
          return res.status(400).json({ error: 'Select a valid post category.' });
        }

        let tags: string[] = [];
        if (typeof req.body.tags === 'string') {
          tags = req.body.tags
            .split(',')
            .map((t: string) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 30))
            .filter(Boolean)
            .slice(0, 8);
        }

        // Validate uploaded files strictly via magic-byte inspection
        const files = (req.files as Express.Multer.File[]) || [];
        const validatedFiles: Array<{
          file: Express.Multer.File;
          detected: { mime: string; kind: 'image' | 'document'; ext: string };
        }> = [];

        for (const file of files) {
          const detected = detectFileSignature(file.buffer);
          if (!detected) {
            return res.status(400).json({
              error: `Unsupported or invalid file content for "${file.originalname}". Only verified PNG, JPEG, WEBP, PDF, and DOCX/PPTX files up to 10 MB are permitted.`,
            });
          }
          validatedFiles.push({ file, detected });
        }

        let targetCollegeId: number | null = null;
        if (me.role === 'admin') {
          targetCollegeId = parsePositiveInt(req.body.collegeId);
          if (!targetCollegeId) {
            return res.status(400).json({
              error: 'Administrators must explicitly select an active college for this post.',
            });
          }
        } else {
          targetCollegeId = me.collegeId;
          if (!targetCollegeId) {
            return res.status(403).json({
              error: 'Your account must be assigned to an active college before posting.',
            });
          }
        }

        const [activeCollege] = await db
          .select({ id: colleges.id })
          .from(colleges)
          .where(and(eq(colleges.id, targetCollegeId), eq(colleges.status, 'active')))
          .limit(1);

        if (!activeCollege) {
          return res.status(400).json({
            error: 'Selected college does not exist or is currently inactive.',
          });
        }

        const collegeId = activeCollege.id;

        const [createdPost] = await db
          .insert(posts)
          .values({
            authorId: me.id,
            collegeId,
            category,
            title,
            content,
            tags,
            contextLabel,
            externalLink,
            visibility,
          })
          .returning();

        const attachmentMeta = [];
        for (const { file, detected } of validatedFiles) {
          const storedName = `${crypto.randomUUID()}${detected.ext}`;
          const targetPath = path.join(UPLOADS_DIR, storedName);
          fs.writeFileSync(targetPath, file.buffer);

          const [savedAtt] = await db
            .insert(postAttachments)
            .values({
              postId: createdPost.id,
              uploaderId: me.id,
              originalName: file.originalname.slice(0, 120),
              storedName,
              mimeType: detected.mime,
              sizeBytes: file.size,
              kind: detected.kind,
            })
            .returning();

          attachmentMeta.push({
            id: savedAtt.id,
            originalName: savedAtt.originalName,
            mimeType: savedAtt.mimeType,
            sizeBytes: savedAtt.sizeBytes,
            kind: savedAtt.kind,
          });
        }

        res.status(201).json({
          post: {
            ...createdPost,
            author: sanitizePublicProfile(me, me),
            attachments: attachmentMeta,
            isLiked: false,
            isSaved: false,
            isFollowingAuthor: false,
          },
        });
      } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: 'Unable to publish post.' });
      }
    }
  );

  app.patch('/api/posts/:id', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const postId = Number(req.params.id);
      const [existing] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Post not found.' });
      }
      if (existing.authorId !== me.id && me.role !== 'admin') {
        return res.status(403).json({ error: 'You can only edit your own posts.' });
      }

      const body = req.body || {};
      const title =
        typeof body.title === 'string' && body.title.trim().length >= 3
          ? body.title.trim().slice(0, 160)
          : existing.title;
      const content =
        typeof body.content === 'string' && body.content.trim().length >= 10
          ? body.content.trim().slice(0, 8000)
          : existing.content;
      const category =
        typeof body.category === 'string' && ALLOWED_CATEGORIES.has(body.category)
          ? body.category
          : existing.category;
      const contextLabel =
        typeof body.contextLabel === 'string'
          ? body.contextLabel.trim().slice(0, 100)
          : existing.contextLabel;

      const [updated] = await db
        .update(posts)
        .set({ title, content, category, contextLabel, updatedAt: new Date() })
        .where(eq(posts.id, postId))
        .returning();

      res.json({ post: updated });
    } catch (error) {
      console.error('Error editing post:', error);
      res.status(500).json({ error: 'Unable to update post.' });
    }
  });

  app.delete('/api/posts/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const postId = Number(req.params.id);
      const [existing] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Post not found.' });
      }
      const isMod = me.role === 'admin' || me.role === 'moderator';
      if (existing.authorId !== me.id && !isMod) {
        return res.status(403).json({ error: 'You do not have permission to delete this post.' });
      }

      const atts = await db
        .select()
        .from(postAttachments)
        .where(eq(postAttachments.postId, postId));
      for (const att of atts) {
        const filePath = path.join(UPLOADS_DIR, att.storedName);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await db.delete(posts).where(eq(posts.id, postId));
      if (isMod && existing.authorId !== me.id) {
        await db.insert(auditLogs).values({
          actorId: me.id,
          action: 'POST_DELETED_BY_MODERATOR',
          targetType: 'post',
          targetId: postId,
          reason: 'Removed during moderation review',
        });
      }

      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).json({ error: 'Unable to delete post.' });
    }
  });

  // Protected private attachment access
  app.get('/api/attachments/:id', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const attId = Number(req.params.id);
      const [att] = await db
        .select()
        .from(postAttachments)
        .where(eq(postAttachments.id, attId))
        .limit(1);

      if (!att) {
        return res.status(404).json({ error: 'Attachment not found.' });
      }

      const [parentPost] = await db
        .select()
        .from(posts)
        .where(eq(posts.id, att.postId))
        .limit(1);

      if (!parentPost || parentPost.isHidden) {
        return res.status(404).json({ error: 'Resource unavailable.' });
      }

      if (
        me.role !== 'admin' &&
        parentPost.visibility !== 'public_preview' &&
        me.collegeId !== parentPost.collegeId
      ) {
        return res.status(403).json({ error: 'Access restricted to verified college members.' });
      }

      const filePath = path.join(UPLOADS_DIR, att.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Stored file missing.' });
      }

      res.setHeader('Content-Type', att.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${att.kind === 'image' ? 'inline' : 'attachment'}; filename="${att.originalName.replace(/"/g, '')}"`
      );
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('Error streaming attachment:', error);
      res.status(500).json({ error: 'Unable to download attachment.' });
    }
  });

  // Like / Save / Comments
  app.post('/api/posts/:id/like', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const postId = Number(req.params.id);
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post) return res.status(404).json({ error: 'Post not found.' });

      const existing = await db
        .select()
        .from(likes)
        .where(and(eq(likes.postId, postId), eq(likes.userId, me.id)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(likes).where(eq(likes.id, existing[0].id));
        const [updated] = await db
          .update(posts)
          .set({ likesCount: sql`GREATEST(0, ${posts.likesCount} - 1)` })
          .where(eq(posts.id, postId))
          .returning();
        return res.json({ liked: false, likesCount: updated.likesCount });
      } else {
        await db.insert(likes).values({ postId, userId: me.id });
        const [updated] = await db
          .update(posts)
          .set({ likesCount: sql`${posts.likesCount} + 1` })
          .where(eq(posts.id, postId))
          .returning();

        if (post.authorId !== me.id) {
          await db.insert(notifications).values({
            recipientId: post.authorId,
            actorId: me.id,
            type: 'like',
            entityId: postId,
            message: `${me.displayName} appreciated your post "${post.title.slice(0, 60)}"`,
          });
        }
        return res.json({ liked: true, likesCount: updated.likesCount });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      res.status(500).json({ error: 'Unable to update reaction.' });
    }
  });

  app.post('/api/posts/:id/save', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const postId = Number(req.params.id);
      const existing = await db
        .select()
        .from(savedPosts)
        .where(and(eq(savedPosts.postId, postId), eq(savedPosts.userId, me.id)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(savedPosts).where(eq(savedPosts.id, existing[0].id));
        return res.json({ saved: false });
      }
      await db.insert(savedPosts).values({ postId, userId: me.id });
      return res.json({ saved: true });
    } catch (error) {
      console.error('Error saving post:', error);
      res.status(500).json({ error: 'Unable to save post.' });
    }
  });

  app.get('/api/posts/:id/comments', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const postId = parsePositiveInt(req.params.id);
      if (!postId) {
        return res.status(400).json({ error: 'Invalid post ID.' });
      }
      const viewer = req.currentUser;
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || post.isHidden) {
        return res.status(404).json({ error: 'Post not found.' });
      }
      if (post.visibility !== 'public_preview') {
        if (viewer?.verificationStatus !== 'verified') {
          return res.status(403).json({ error: 'Verified membership required to view comments.' });
        }
        if (
          viewer.role !== 'admin' &&
          (viewer.collegeId === null || viewer.collegeId !== post.collegeId)
        ) {
          return res.status(403).json({ error: 'Access restricted to verified college members.' });
        }
      }

      const commentRows = await db
        .select()
        .from(comments)
        .where(and(eq(comments.postId, postId), eq(comments.isHidden, false)))
        .orderBy(comments.createdAt);

      if (commentRows.length === 0) {
        return res.json([]);
      }

      const authorIds = Array.from(new Set(commentRows.map((c) => c.authorId)));
      const authorRows = await db
        .select()
        .from(users)
        .where(inArray(users.id, authorIds));
      const authorMap = new Map(authorRows.map((u) => [u.id, u]));

      res.json(
        commentRows.map((c) => {
          const author = authorMap.get(c.authorId);
          return {
            ...c,
            author: author ? sanitizePublicProfile(author, viewer) : null,
          };
        })
      );
    } catch (error) {
      console.error('Error loading comments:', error);
      res.status(500).json({ error: 'Unable to load comments.' });
    }
  });

  app.post('/api/posts/:id/comments', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      if (!checkRateLimit(`comment:${me.id}`, 25, 10 * 60 * 1000)) {
        return res.status(429).json({ error: 'Commenting too quickly. Please wait a moment.' });
      }

      const postId = Number(req.params.id);
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (content.length < 2 || content.length > 1500) {
        return res.status(400).json({ error: 'Comment must be between 2 and 1,500 characters.' });
      }

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || post.isHidden) {
        return res.status(404).json({ error: 'Post not found.' });
      }

      const [created] = await db
        .insert(comments)
        .values({ postId, authorId: me.id, content })
        .returning();

      await db
        .update(posts)
        .set({ commentsCount: sql`${posts.commentsCount} + 1` })
        .where(eq(posts.id, postId));

      if (post.authorId !== me.id) {
        await db.insert(notifications).values({
          recipientId: post.authorId,
          actorId: me.id,
          type: 'comment',
          entityId: postId,
          message: `${me.displayName} commented on "${post.title.slice(0, 50)}"`,
        });
      }

      res.status(201).json({
        comment: {
          ...created,
          author: sanitizePublicProfile(me, me),
        },
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ error: 'Unable to add comment.' });
    }
  });

  // Discover People & Profiles
  app.get('/api/discover/people', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const viewer = req.currentUser;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
      const branch = typeof req.query.branch === 'string' ? req.query.branch.trim() : '';

      const conditions: any[] = [
        eq(users.isRestricted, false),
        eq(users.verificationStatus, 'verified'),
      ];

      if (role && ['student', 'faculty', 'alumni'].includes(role)) {
        conditions.push(eq(users.role, role));
      }
      if (branch) {
        conditions.push(ilike(users.branch, `%${branch}%`));
      }
      if (q) {
        const pattern = `%${q}%`;
        conditions.push(
          or(
            ilike(users.displayName, pattern),
            ilike(users.headline, pattern),
            ilike(users.branch, pattern),
            sql`array_to_string(${users.skills}, ' ') ILIKE ${pattern}`
          )
        );
      }

      const memberRows = await db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(desc(users.createdAt))
        .limit(40);

      let followingIds: number[] = [];
      let blockedIds: number[] = [];
      if (viewer) {
        const fRows = await db
          .select({ followingId: follows.followingId })
          .from(follows)
          .where(eq(follows.followerId, viewer.id));
        followingIds = fRows.map((r) => r.followingId);

        const bRows = await db
          .select({ blockedId: blocks.blockedId })
          .from(blocks)
          .where(eq(blocks.blockerId, viewer.id));
        blockedIds = bRows.map((b) => b.blockedId);
      }

      const results = memberRows
        .filter((m) => !blockedIds.includes(m.id))
        .map((m) => ({
          ...sanitizePublicProfile(m, viewer),
          isFollowing: followingIds.includes(m.id),
        }));

      res.json(results);
    } catch (error) {
      console.error('Error discovering people:', error);
      res.status(500).json({ error: 'Unable to load campus directory.' });
    }
  });

  app.get('/api/users/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const targetId = parsePositiveInt(req.params.id);
      if (!targetId) {
        return res.status(400).json({ error: 'Invalid member ID.' });
      }
      const viewer = req.currentUser;
      const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!target || target.isRestricted) {
        return res.status(404).json({ error: 'Member not found.' });
      }

      const followerCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followingId, targetId));
      const followingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(eq(follows.followerId, targetId));

      let isFollowing = false;
      let isBlocked = false;
      if (viewer) {
        const f = await db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, targetId)))
          .limit(1);
        isFollowing = f.length > 0;

        const b = await db
          .select()
          .from(blocks)
          .where(and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, targetId)))
          .limit(1);
        isBlocked = b.length > 0;
      }

      const canSeeCollegePosts =
        viewer?.role === 'admin' ||
        viewer?.id === target.id ||
        (viewer?.verificationStatus === 'verified' &&
          viewer.collegeId !== null &&
          target.collegeId !== null &&
          viewer.collegeId === target.collegeId);

      const userPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.authorId, targetId),
            eq(posts.isHidden, false),
            canSeeCollegePosts ? sql`true` : eq(posts.visibility, 'public_preview')
          )
        )
        .orderBy(desc(posts.createdAt))
        .limit(10);

      res.json({
        user: sanitizePublicProfile(target, viewer),
        followersCount: followerCount[0]?.count ?? 0,
        followingCount: followingCount[0]?.count ?? 0,
        isFollowing,
        isBlocked,
        posts: userPosts,
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
      res.status(500).json({ error: 'Unable to load member profile.' });
    }
  });

  app.post('/api/users/:id/follow', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const targetId = Number(req.params.id);
      if (targetId === me.id) {
        return res.status(400).json({ error: 'You cannot follow yourself.' });
      }

      const existing = await db
        .select()
        .from(follows)
        .where(and(eq(follows.followerId, me.id), eq(follows.followingId, targetId)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(follows).where(eq(follows.id, existing[0].id));
        return res.json({ following: false });
      }

      await db.insert(follows).values({ followerId: me.id, followingId: targetId });
      await db.insert(notifications).values({
        recipientId: targetId,
        actorId: me.id,
        type: 'follow',
        entityId: me.id,
        message: `${me.displayName} started following you on CampusPath`,
      });
      return res.json({ following: true });
    } catch (error) {
      console.error('Error toggling follow:', error);
      res.status(500).json({ error: 'Unable to update follow status.' });
    }
  });

  app.post('/api/users/:id/block', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const targetId = Number(req.params.id);
      if (targetId === me.id) {
        return res.status(400).json({ error: 'Invalid target.' });
      }

      const existing = await db
        .select()
        .from(blocks)
        .where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, targetId)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(blocks).where(eq(blocks.id, existing[0].id));
        return res.json({ blocked: false });
      }

      await db.insert(blocks).values({ blockerId: me.id, blockedId: targetId });
      await db
        .delete(follows)
        .where(
          or(
            and(eq(follows.followerId, me.id), eq(follows.followingId, targetId)),
            and(eq(follows.followerId, targetId), eq(follows.followingId, me.id))
          )
        );
      return res.json({ blocked: true });
    } catch (error) {
      console.error('Error toggling block:', error);
      res.status(500).json({ error: 'Unable to update block setting.' });
    }
  });

  // Direct Messaging
  app.get('/api/conversations', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const myMemberships = await db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, me.id));

      if (myMemberships.length === 0) {
        return res.json([]);
      }

      const convIds = myMemberships.map((m) => m.conversationId);
      const convRows = await db
        .select()
        .from(conversations)
        .where(inArray(conversations.id, convIds))
        .orderBy(desc(conversations.lastMessageAt));

      const allMembers = await db
        .select()
        .from(conversationMembers)
        .where(inArray(conversationMembers.conversationId, convIds));

      const peerIds = Array.from(
        new Set(allMembers.filter((m) => m.userId !== me.id).map((m) => m.userId))
      );
      const peerUsers =
        peerIds.length > 0
          ? await db.select().from(users).where(inArray(users.id, peerIds))
          : [];
      const peerMap = new Map(peerUsers.map((u) => [u.id, u]));

      const list = await Promise.all(
        convRows.map(async (conv) => {
          const membership = myMemberships.find((m) => m.conversationId === conv.id)!;
          const peerMembership = allMembers.find(
            (m) => m.conversationId === conv.id && m.userId !== me.id
          );
          const peer = peerMembership ? peerMap.get(peerMembership.userId) : null;

          const latestMsg = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          const unreadCountRows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conv.id),
                sql`${messages.senderId} != ${me.id}`,
                sql`${messages.createdAt} > ${membership.lastReadAt}`
              )
            );

          return {
            id: conv.id,
            lastMessageAt: conv.lastMessageAt,
            peer: peer ? sanitizePublicProfile(peer, me) : null,
            lastMessage: latestMsg[0] ?? null,
            unreadCount: unreadCountRows[0]?.count ?? 0,
          };
        })
      );

      res.json(list);
    } catch (error) {
      console.error('Error loading conversations:', error);
      res.status(500).json({ error: 'Unable to load conversations.' });
    }
  });

  app.post('/api/conversations', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const targetUserId = Number(req.body?.userId);
      if (!targetUserId || targetUserId === me.id) {
        return res.status(400).json({ error: 'Select a valid member to message.' });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!target || target.isRestricted || target.verificationStatus !== 'verified') {
        return res.status(404).json({ error: 'Recipient is unavailable for messaging.' });
      }

      const blockedCheck = await db
        .select()
        .from(blocks)
        .where(
          or(
            and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, targetUserId)),
            and(eq(blocks.blockerId, targetUserId), eq(blocks.blockedId, me.id))
          )
        )
        .limit(1);
      if (blockedCheck.length > 0) {
        return res.status(403).json({ error: 'Direct messaging is unavailable with this user.' });
      }

      if (target.privacySettings?.allowMessagesFrom === 'followers') {
        const followsCheck = await db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, targetUserId), eq(follows.followingId, me.id)))
          .limit(1);
        if (followsCheck.length === 0) {
          return res.status(403).json({
            error: 'This member restricts messages to accounts they follow.',
          });
        }
      }

      // Check existing 1:1 conversation
      const myConvs = await db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, me.id));

      if (myConvs.length > 0) {
        const shared = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              inArray(
                conversationMembers.conversationId,
                myConvs.map((c) => c.conversationId)
              ),
              eq(conversationMembers.userId, targetUserId)
            )
          )
          .limit(1);

        if (shared.length > 0) {
          return res.json({ conversationId: shared[0].conversationId });
        }
      }

      const [createdConv] = await db
        .insert(conversations)
        .values({ collegeId: me.collegeId })
        .returning();

      await db.insert(conversationMembers).values([
        { conversationId: createdConv.id, userId: me.id },
        { conversationId: createdConv.id, userId: targetUserId },
      ]);

      res.status(201).json({ conversationId: createdConv.id });
    } catch (error) {
      console.error('Error starting conversation:', error);
      res.status(500).json({ error: 'Unable to open conversation.' });
    }
  });

  app.get('/api/conversations/:id/messages', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const convId = Number(req.params.id);

      const membership = await db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, convId),
            eq(conversationMembers.userId, me.id)
          )
        )
        .limit(1);

      if (membership.length === 0) {
        return res.status(403).json({ error: 'Access denied to this conversation.' });
      }

      await db
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(eq(conversationMembers.id, membership[0].id));

      const msgRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(messages.createdAt)
        .limit(100);

      res.json(msgRows);
    } catch (error) {
      console.error('Error loading messages:', error);
      res.status(500).json({ error: 'Unable to load conversation messages.' });
    }
  });

  app.post('/api/conversations/:id/messages', requireAuth, requireVerified, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      if (!checkRateLimit(`dm:${me.id}`, 30, 5 * 60 * 1000)) {
        return res.status(429).json({ error: 'Messaging rate limit reached. Please pause briefly.' });
      }

      const convId = Number(req.params.id);
      const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      if (content.length < 1 || content.length > 2000) {
        return res.status(400).json({ error: 'Message must be between 1 and 2,000 characters.' });
      }

      const members = await db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, convId));

      const isMember = members.some((m) => m.userId === me.id);
      if (!isMember) {
        return res.status(403).json({ error: 'Access denied to this conversation.' });
      }

      const peerIds = members.filter((m) => m.userId !== me.id).map((m) => m.userId);
      if (peerIds.length > 0) {
        const blockedCheck = await db
          .select()
          .from(blocks)
          .where(
            or(
              and(eq(blocks.blockerId, me.id), inArray(blocks.blockedId, peerIds)),
              and(inArray(blocks.blockerId, peerIds), eq(blocks.blockedId, me.id))
            )
          )
          .limit(1);
        if (blockedCheck.length > 0) {
          return res.status(403).json({ error: 'Cannot send messages to a blocked member.' });
        }
      }

      const [created] = await db
        .insert(messages)
        .values({ conversationId: convId, senderId: me.id, content })
        .returning();

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, convId));

      await db
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationMembers.conversationId, convId),
            eq(conversationMembers.userId, me.id)
          )
        );

      for (const peerId of peerIds) {
        await db.insert(notifications).values({
          recipientId: peerId,
          actorId: me.id,
          type: 'message',
          entityId: convId,
          message: `New message from ${me.displayName}`,
        });
      }

      res.status(201).json({ message: created });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Unable to send message.' });
    }
  });

  // Notifications
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientId, me.id))
        .orderBy(desc(notifications.createdAt))
        .limit(40);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Unable to load notifications.' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.recipientId, me.id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Error marking notifications read:', error);
      res.status(500).json({ error: 'Unable to update notifications.' });
    }
  });

  // Reports
  app.post('/api/reports', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.currentUser!;
      const { targetType, targetId, reason, details, priority } = req.body || {};
      if (!['post', 'comment', 'user', 'message'].includes(targetType)) {
        return res.status(400).json({ error: 'Invalid report target type.' });
      }
      if (!Number.isFinite(Number(targetId))) {
        return res.status(400).json({ error: 'Invalid target ID.' });
      }
      if (typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ error: 'Please provide a report reason.' });
      }

      const safePriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';

      const [created] = await db
        .insert(reports)
        .values({
          reporterId: me.id,
          targetType,
          targetId: Number(targetId),
          reason: reason.trim().slice(0, 120),
          details: typeof details === 'string' ? details.trim().slice(0, 1000) : '',
          priority: safePriority,
        })
        .returning();

      res.status(201).json({ report: created });
    } catch (error) {
      console.error('Error filing report:', error);
      res.status(500).json({ error: 'Unable to submit report.' });
    }
  });

  // Admin & Moderator Console
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireRole(['admin', 'moderator']),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;

        // Moderators receive ONLY the minimized reports queue (no reporterId, no reviewedBy,
        // and zero queries against users, verificationRequests, colleges, or auditLogs).
        if (me.role !== 'admin') {
          const reportQueue = await db
            .select({
              id: reports.id,
              targetType: reports.targetType,
              targetId: reports.targetId,
              reason: reports.reason,
              details: reports.details,
              priority: reports.priority,
              status: reports.status,
              resolutionNotes: reports.resolutionNotes,
              createdAt: reports.createdAt,
              resolvedAt: reports.resolvedAt,
            })
            .from(reports)
            .orderBy(desc(reports.createdAt))
            .limit(40);

          return res.json({
            verifications: [],
            reports: reportQueue,
            members: [],
            colleges: [],
            auditLogs: [],
          });
        }

        const verificationQueue = await db
          .select({
            id: verificationRequests.id,
            userId: verificationRequests.userId,
            collegeId: verificationRequests.collegeId,
            requestedRole: verificationRequests.requestedRole,
            collegeEmail: verificationRequests.collegeEmail,
            method: verificationRequests.method,
            evidenceNote: verificationRequests.evidenceNote,
            status: verificationRequests.status,
            reviewedBy: verificationRequests.reviewedBy,
            reviewNotes: verificationRequests.reviewNotes,
            createdAt: verificationRequests.createdAt,
            reviewedAt: verificationRequests.reviewedAt,
          })
          .from(verificationRequests)
          .orderBy(desc(verificationRequests.createdAt))
          .limit(30);

        const queueUserIds = Array.from(new Set(verificationQueue.map((v) => v.userId)));
        const queueUsers =
          queueUserIds.length > 0
            ? await db
                .select({
                  id: users.id,
                  displayName: users.displayName,
                  email: users.email,
                  branch: users.branch,
                })
                .from(users)
                .where(inArray(users.id, queueUserIds))
            : [];
        const queueUserMap = new Map(queueUsers.map((u) => [u.id, u]));

        const reportQueue = await db
          .select()
          .from(reports)
          .orderBy(desc(reports.createdAt))
          .limit(40);

        const memberRows = await db
          .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            role: users.role,
            verificationStatus: users.verificationStatus,
            collegeId: users.collegeId,
            branch: users.branch,
            isRestricted: users.isRestricted,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(60);

        const collegeRows = await db.select().from(colleges).orderBy(colleges.id);

        const logs = await db
          .select()
          .from(auditLogs)
          .orderBy(desc(auditLogs.createdAt))
          .limit(40);

        res.json({
          verifications: verificationQueue.map((v) => ({
            ...v,
            evidenceNote:
              v.status === 'pending' ? v.evidenceNote : '[Redacted after decision]',
            user: queueUserMap.get(v.userId) ?? null,
          })),
          reports: reportQueue,
          members: memberRows,
          colleges: collegeRows,
          auditLogs: logs,
        });
      } catch (error) {
        console.error('Error loading admin overview:', error);
        res.status(500).json({ error: 'Unable to load admin console.' });
      }
    }
  );

  // Admin-only non-destructive verification provenance audit
  app.get(
    '/api/admin/verification-audit',
    requireAuth,
    requireRole(['admin']),
    async (_req: AuthRequest, res: Response) => {
      try {
        const allVerifiedOrAdmin = await db
          .select({
            id: users.id,
            uid: users.uid,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
            verificationStatus: users.verificationStatus,
            collegeId: users.collegeId,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(or(eq(users.verificationStatus, 'verified'), eq(users.role, 'admin')))
          .orderBy(users.id);

        const userIds = allVerifiedOrAdmin.map((u) => u.id);
        const approvedReqs =
          userIds.length > 0
            ? await db
                .select({
                  userId: verificationRequests.userId,
                  method: verificationRequests.method,
                  status: verificationRequests.status,
                  reviewedAt: verificationRequests.reviewedAt,
                })
                .from(verificationRequests)
                .where(
                  and(
                    inArray(verificationRequests.userId, userIds),
                    eq(verificationRequests.status, 'approved')
                  )
                )
            : [];

        const memberUpdateLogs =
          userIds.length > 0
            ? await db
                .select({
                  targetId: auditLogs.targetId,
                  action: auditLogs.action,
                  metadata: auditLogs.metadata,
                  createdAt: auditLogs.createdAt,
                })
                .from(auditLogs)
                .where(
                  and(
                    eq(auditLogs.action, 'ADMIN_MEMBER_UPDATED'),
                    eq(auditLogs.targetType, 'user'),
                    inArray(auditLogs.targetId, userIds)
                  )
                )
            : [];

        const configuredBootstrapEmail = getConfiguredBootstrapAdminEmail();
        const reqsByUser = new Map<number, typeof approvedReqs>();
        for (const r of approvedReqs) {
          const list = reqsByUser.get(r.userId) || [];
          list.push(r);
          reqsByUser.set(r.userId, list);
        }

        const logsByUser = new Map<number, typeof memberUpdateLogs>();
        for (const l of memberUpdateLogs) {
          if (l.targetId === null) continue;
          const list = logsByUser.get(l.targetId) || [];
          list.push(l);
          logsByUser.set(l.targetId, list);
        }

        const accounts = allVerifiedOrAdmin.map((u) => {
          const isSeedAccount = u.uid.startsWith('seed_');
          const uReqs = reqsByUser.get(u.id) || [];
          const uLogs = logsByUser.get(u.id) || [];
          const normalizedEmail = u.email.trim().toLowerCase();

          const wasPromotedToAdmin = uLogs.some(
            (l) => (l.metadata as Record<string, unknown>)?.role === 'admin'
          );
          const wasVerifiedByAdminAction = uLogs.some(
            (l) => (l.metadata as Record<string, unknown>)?.verificationStatus === 'verified'
          );
          const hasAdminReviewApproval = uReqs.some((r) => r.method === 'admin_review');
          const hasLegacyEmailOtpApproval = uReqs.some((r) => r.method === 'email_otp');

          let provenance:
            | 'promoted_admin'
            | 'configured_bootstrap_admin'
            | 'unknown_or_manual_admin'
            | 'admin_review_approved'
            | 'verified_by_admin_action'
            | 'legacy_email_otp'
            | 'auto_verified_or_unknown';

          if (u.role === 'admin') {
            if (wasPromotedToAdmin) {
              provenance = 'promoted_admin';
            } else if (
              Boolean(configuredBootstrapEmail) &&
              normalizedEmail === configuredBootstrapEmail
            ) {
              provenance = 'configured_bootstrap_admin';
            } else {
              provenance = 'unknown_or_manual_admin';
            }
          } else if (hasAdminReviewApproval) {
            provenance = 'admin_review_approved';
          } else if (wasVerifiedByAdminAction) {
            provenance = 'verified_by_admin_action';
          } else if (hasLegacyEmailOtpApproval) {
            provenance = 'legacy_email_otp';
          } else {
            provenance = 'auto_verified_or_unknown';
          }

          const needsReview =
            !isSeedAccount &&
            (provenance === 'legacy_email_otp' ||
              provenance === 'auto_verified_or_unknown' ||
              provenance === 'unknown_or_manual_admin');

          return {
            id: u.id,
            displayName: u.displayName,
            role: u.role,
            verificationStatus: u.verificationStatus,
            collegeId: u.collegeId,
            isSeedAccount,
            provenance,
            needsReview,
            createdAt: u.createdAt,
          };
        });

        const summary = accounts.reduce<Record<string, number>>((acc, row) => {
          acc[row.provenance] = (acc[row.provenance] || 0) + 1;
          return acc;
        }, {});

        res.json({
          totalAudited: accounts.length,
          flaggedForReview: accounts.filter((a) => a.needsReview).length,
          summary,
          accounts,
        });
      } catch (error) {
        console.error('Error generating verification provenance audit:', error);
        res.status(500).json({ error: 'Unable to run verification audit.' });
      }
    }
  );

  app.post(
    '/api/admin/verifications/:id/decide',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;
        const reqId = parsePositiveInt(req.params.id);
        if (!reqId) {
          return res.status(400).json({ error: 'Invalid verification request ID.' });
        }
        const { decision, reviewNotes } = req.body || {};
        if (!['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ error: 'Decision must be approved or rejected.' });
        }
        const safeReviewNotes =
          typeof reviewNotes === 'string' ? reviewNotes.trim().slice(0, 400) : '';

        await db.transaction(async (tx) => {
          // Atomic compare-and-set: only transition rows that are still 'pending'
          const [updatedReq] = await tx
            .update(verificationRequests)
            .set({
              status: decision,
              reviewedBy: me.id,
              reviewNotes: safeReviewNotes,
              reviewedAt: new Date(),
            })
            .where(
              and(
                eq(verificationRequests.id, reqId),
                eq(verificationRequests.status, 'pending')
              )
            )
            .returning();

          if (!updatedReq) {
            const [existing] = await tx
              .select({ id: verificationRequests.id, status: verificationRequests.status })
              .from(verificationRequests)
              .where(eq(verificationRequests.id, reqId))
              .limit(1);
            if (!existing) {
              throw new HttpError(404, 'Verification request not found.');
            }
            throw new HttpError(
              409,
              `Verification request has already been ${existing.status}.`,
              'ALREADY_DECIDED'
            );
          }

          const [targetUser] = await tx
            .select()
            .from(users)
            .where(eq(users.id, updatedReq.userId))
            .limit(1);
          if (!targetUser) {
            throw new HttpError(404, 'Applicant account not found.');
          }

          if (decision === 'approved') {
            const [activeCollege] = await tx
              .select({ id: colleges.id })
              .from(colleges)
              .where(
                and(eq(colleges.id, updatedReq.collegeId), eq(colleges.status, 'active'))
              )
              .limit(1);
            if (!activeCollege) {
              throw new HttpError(
                400,
                'Cannot approve verification because the requested college is inactive or missing.'
              );
            }

            const preservedPrivilegedRole =
              targetUser.role === 'admin' || targetUser.role === 'moderator';
            const nextRole = preservedPrivilegedRole
              ? targetUser.role
              : ['student', 'faculty', 'alumni'].includes(updatedReq.requestedRole)
              ? updatedReq.requestedRole
              : 'student';

            await tx
              .update(users)
              .set({
                verificationStatus: 'verified',
                role: nextRole,
                collegeId: activeCollege.id,
                collegeEmail: updatedReq.collegeEmail || targetUser.collegeEmail,
                updatedAt: new Date(),
              })
              .where(eq(users.id, targetUser.id));
          } else {
            // Rejection never overwrites collegeId and never demotes privileged roles
            await tx
              .update(users)
              .set({
                verificationStatus: 'rejected',
                updatedAt: new Date(),
              })
              .where(eq(users.id, targetUser.id));
          }

          await tx.insert(notifications).values({
            recipientId: updatedReq.userId,
            actorId: me.id,
            type: 'verification',
            entityId: updatedReq.id,
            message:
              decision === 'approved'
                ? 'Your CampusPath college membership has been verified.'
                : `Your verification request was not approved: ${safeReviewNotes || 'Please submit clearer campus details.'}`,
          });

          await tx.insert(auditLogs).values({
            actorId: me.id,
            action: `VERIFICATION_${decision.toUpperCase()}`,
            targetType: 'verification_request',
            targetId: reqId,
            reason: safeReviewNotes,
            metadata: {
              userId: updatedReq.userId,
              requestedRole: updatedReq.requestedRole,
              collegeId: updatedReq.collegeId,
            },
          });
        });

        res.json({ ok: true });
      } catch (error) {
        if (error instanceof HttpError) {
          return res
            .status(error.status)
            .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
        }
        console.error('Error deciding verification:', error);
        res.status(500).json({ error: 'Unable to update verification request.' });
      }
    }
  );

  app.post(
    '/api/admin/reports/:id/decide',
    requireAuth,
    requireRole(['admin', 'moderator']),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;
        const reportId = parsePositiveInt(req.params.id);
        if (!reportId) {
          return res.status(400).json({ error: 'Invalid report ID.' });
        }
        const { status, resolutionNotes, hideTarget } = req.body || {};
        if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
          return res.status(400).json({ error: 'Invalid report status.' });
        }
        const safeResolutionNotes =
          typeof resolutionNotes === 'string' ? resolutionNotes.trim().slice(0, 500) : '';

        await db.transaction(async (tx) => {
          const [rep] = await tx
            .select()
            .from(reports)
            .where(eq(reports.id, reportId))
            .limit(1);
          if (!rep) {
            throw new HttpError(404, 'Report not found.');
          }

          if (hideTarget && rep.targetType === 'user') {
            if (rep.targetId === me.id) {
              throw new HttpError(403, 'You cannot restrict your own account.');
            }
            const [targetUser] = await tx
              .select({ id: users.id, role: users.role })
              .from(users)
              .where(eq(users.id, rep.targetId))
              .limit(1);
            if (!targetUser) {
              throw new HttpError(404, 'Reported user not found.');
            }
            if (
              me.role === 'moderator' &&
              (targetUser.role === 'admin' || targetUser.role === 'moderator')
            ) {
              throw new HttpError(
                403,
                'Moderators cannot restrict administrator or moderator accounts.'
              );
            }
          }

          await tx
            .update(reports)
            .set({
              status,
              resolutionNotes: safeResolutionNotes,
              reviewedBy: me.id,
              resolvedAt: status === 'resolved' || status === 'dismissed' ? new Date() : null,
            })
            .where(eq(reports.id, reportId));

          if (hideTarget && rep.targetType === 'post') {
            await tx.update(posts).set({ isHidden: true }).where(eq(posts.id, rep.targetId));
          } else if (hideTarget && rep.targetType === 'comment') {
            await tx.update(comments).set({ isHidden: true }).where(eq(comments.id, rep.targetId));
          } else if (hideTarget && rep.targetType === 'user') {
            await tx
              .update(users)
              .set({ isRestricted: true, updatedAt: new Date() })
              .where(eq(users.id, rep.targetId));
          }

          await tx.insert(auditLogs).values({
            actorId: me.id,
            action: `REPORT_${status.toUpperCase()}`,
            targetType: rep.targetType,
            targetId: rep.targetId,
            reason: safeResolutionNotes,
            metadata: { reportId, hideTarget: Boolean(hideTarget) },
          });
        });

        res.json({ ok: true });
      } catch (error) {
        if (error instanceof HttpError) {
          return res
            .status(error.status)
            .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
        }
        console.error('Error deciding report:', error);
        res.status(500).json({ error: 'Unable to resolve report.' });
      }
    }
  );

  app.post(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;
        const targetId = parsePositiveInt(req.params.id);
        if (!targetId) {
          return res.status(400).json({ error: 'Invalid member ID.' });
        }
        const { role, isRestricted, verificationStatus, collegeId } = req.body || {};

        await db.transaction(async (tx) => {
          const [target] = await tx
            .select()
            .from(users)
            .where(eq(users.id, targetId))
            .limit(1);
          if (!target) {
            throw new HttpError(404, 'Member not found.');
          }

          const updates: Record<string, unknown> = { updatedAt: new Date() };

          if (role !== undefined) {
            if (!['student', 'faculty', 'alumni', 'moderator', 'admin'].includes(role)) {
              throw new HttpError(400, 'Invalid member role specified.');
            }
            if (targetId === me.id && role !== 'admin') {
              throw new HttpError(400, 'You cannot demote your own administrator account.');
            }
            updates.role = role;
          }

          if (isRestricted !== undefined) {
            if (typeof isRestricted !== 'boolean') {
              throw new HttpError(400, 'isRestricted must be a boolean.');
            }
            if (targetId === me.id && isRestricted) {
              throw new HttpError(400, 'You cannot restrict your own administrator account.');
            }
            updates.isRestricted = isRestricted;
          }

          if (verificationStatus !== undefined) {
            if (!['unverified', 'pending', 'verified', 'rejected'].includes(verificationStatus)) {
              throw new HttpError(400, 'Invalid verification status specified.');
            }
            updates.verificationStatus = verificationStatus;
          }

          let nextCollegeId: number | null | undefined = undefined;
          if (collegeId !== undefined) {
            if (collegeId === null) {
              nextCollegeId = null;
              updates.collegeId = null;
            } else {
              const parsedCollegeId = parsePositiveInt(collegeId);
              if (!parsedCollegeId) {
                throw new HttpError(400, 'Invalid college ID.');
              }
              const [activeCollege] = await tx
                .select({ id: colleges.id })
                .from(colleges)
                .where(and(eq(colleges.id, parsedCollegeId), eq(colleges.status, 'active')))
                .limit(1);
              if (!activeCollege) {
                throw new HttpError(
                  400,
                  'Selected college does not exist or is currently inactive.'
                );
              }
              nextCollegeId = activeCollege.id;
              updates.collegeId = activeCollege.id;
            }
          }

          const effectiveVerificationStatus =
            (updates.verificationStatus as string | undefined) ?? target.verificationStatus;
          const effectiveCollegeId =
            nextCollegeId !== undefined ? nextCollegeId : target.collegeId;

          if (effectiveVerificationStatus === 'verified') {
            if (effectiveCollegeId === null) {
              throw new HttpError(
                400,
                'An active college must be assigned before marking a member verified.'
              );
            }
            const [assignedActiveCollege] = await tx
              .select({ id: colleges.id })
              .from(colleges)
              .where(and(eq(colleges.id, effectiveCollegeId), eq(colleges.status, 'active')))
              .limit(1);
            if (!assignedActiveCollege) {
              throw new HttpError(
                400,
                'Cannot mark member verified without a valid active college assignment.'
              );
            }
          }

          await tx.update(users).set(updates).where(eq(users.id, targetId));

          await tx.insert(auditLogs).values({
            actorId: me.id,
            action: 'ADMIN_MEMBER_UPDATED',
            targetType: 'user',
            targetId,
            reason: 'Administrative role or status adjustment',
            metadata: {
              ...(updates.role !== undefined ? { role: updates.role } : {}),
              ...(updates.isRestricted !== undefined
                ? { isRestricted: updates.isRestricted }
                : {}),
              ...(updates.verificationStatus !== undefined
                ? { verificationStatus: updates.verificationStatus }
                : {}),
              ...(updates.collegeId !== undefined ? { collegeId: updates.collegeId } : {}),
            },
          });
        });

        res.json({ ok: true });
      } catch (error) {
        if (error instanceof HttpError) {
          return res
            .status(error.status)
            .json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
        }
        console.error('Error updating member role:', error);
        res.status(500).json({ error: 'Unable to update member.' });
      }
    }
  );

  app.post(
    '/api/admin/colleges',
    requireAuth,
    requireRole(['admin']),
    async (req: AuthRequest, res: Response) => {
      try {
        const me = req.currentUser!;
        const { name, location, approvedDomains, description } = req.body || {};
        if (typeof name !== 'string' || name.trim().length < 3) {
          return res.status(400).json({ error: 'College name is required.' });
        }
        const slug = name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        if (!slug) {
          return res.status(400).json({ error: 'Enter a valid college name.' });
        }

        const rawDomains = Array.isArray(approvedDomains)
          ? approvedDomains.filter((d): d is string => typeof d === 'string')
          : typeof approvedDomains === 'string'
          ? approvedDomains.split(',')
          : [];

        const validatedDomains: string[] = [];
        const seenDomains = new Set<string>();
        for (const raw of rawDomains) {
          if (!raw.trim()) continue;
          const result = validateCollegeDomain(raw);
          if (!result.valid) {
            return res.status(400).json({ error: result.error });
          }
          if (!seenDomains.has(result.domain)) {
            seenDomains.add(result.domain);
            validatedDomains.push(result.domain);
          }
        }

        const [created] = await db
          .insert(colleges)
          .values({
            name: name.trim().slice(0, 120),
            slug,
            location: typeof location === 'string' ? location.trim().slice(0, 120) : '',
            approvedDomains: validatedDomains,
            description: typeof description === 'string' ? description.trim().slice(0, 500) : '',
          })
          .returning();

        await db.insert(auditLogs).values({
          actorId: me.id,
          action: 'COLLEGE_CREATED',
          targetType: 'college',
          targetId: created.id,
          reason: 'Added partner college to CampusPath',
          metadata: { name: created.name, domains: validatedDomains },
        });

        res.status(201).json({ college: created });
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          return res.status(409).json({ error: 'A college with this name already exists.' });
        }
        console.error('Error creating college:', error);
        res.status(500).json({ error: 'Unable to add college.' });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusPath server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
