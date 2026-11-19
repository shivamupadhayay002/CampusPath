import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  link?: string;
  techStack?: string[];
}

export interface AchievementItem {
  id: string;
  title: string;
  issuer: string;
  date: string;
  description?: string;
}

export interface PrivacySettings {
  showEmail: boolean;
  showLinkedIn: boolean;
  showAcademicYear: boolean;
  allowMessagesFrom: 'college' | 'followers';
}

export const colleges = pgTable('colleges', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  approvedDomains: text('approved_domains').array().notNull().default([]),
  location: text('location').notNull().default(''),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('active'), // 'active' | 'inactive'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or seeded UID
  email: text('email').notNull(),
  collegeEmail: text('college_email'),
  displayName: text('display_name').notNull(),
  headline: text('headline').notNull().default('College Student'),
  role: text('role').notNull().default('student'), // 'student' | 'faculty' | 'alumni' | 'moderator' | 'admin'
  verificationStatus: text('verification_status').notNull().default('unverified'), // 'unverified' | 'pending' | 'verified' | 'rejected'
  collegeId: integer('college_id').references(() => colleges.id),
  branch: text('branch').notNull().default(''),
  academicYear: text('academic_year').notNull().default(''),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default(''),
  linkedinUrl: text('linkedin_url').notNull().default(''),
  skills: text('skills').array().notNull().default([]),
  projects: jsonb('projects').$type<ProjectItem[]>().notNull().default([]),
  achievements: jsonb('achievements').$type<AchievementItem[]>().notNull().default([]),
  privacySettings: jsonb('privacy_settings')
    .$type<PrivacySettings>()
    .notNull()
    .default({
      showEmail: false,
      showLinkedIn: true,
      showAcademicYear: true,
      allowMessagesFrom: 'college',
    }),
  isRestricted: boolean('is_restricted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const verificationRequests = pgTable(
  'verification_requests',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    collegeId: integer('college_id')
      .references(() => colleges.id)
      .notNull(),
    requestedRole: text('requested_role').notNull().default('student'),
    collegeEmail: text('college_email').notNull().default(''),
    verificationCode: text('verification_code').notNull().default(''),
    method: text('method').notNull().default('admin_review'), // 'email_otp' | 'admin_review'
    evidenceNote: text('evidence_note').notNull().default(''),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    reviewedBy: integer('reviewed_by').references(() => users.id),
    reviewNotes: text('review_notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (table) => [
    uniqueIndex('verification_requests_one_pending_per_user_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'pending'`),
  ]
);

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  collegeId: integer('college_id')
    .references(() => colleges.id)
    .notNull(),
  category: text('category').notNull(), // 'study_materials' | 'jobs_internships' | 'student_stories' | 'interview_prep' | 'projects_events' | 'announcements'
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').array().notNull().default([]),
  contextLabel: text('context_label').notNull().default(''), // e.g. Course code, Company name, Event date
  externalLink: text('external_link').notNull().default(''),
  visibility: text('visibility').notNull().default('college'), // 'college' | 'public_preview' | 'followers'
  likesCount: integer('likes_count').notNull().default(0),
  commentsCount: integer('comments_count').notNull().default(0),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const postAttachments = pgTable('post_attachments', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .references(() => posts.id, { onDelete: 'cascade' })
    .notNull(),
  uploaderId: integer('uploader_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  originalName: text('original_name').notNull(),
  storedName: text('stored_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  kind: text('kind').notNull().default('document'), // 'image' | 'document'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  postId: integer('post_id')
    .references(() => posts.id, { onDelete: 'cascade' })
    .notNull(),
  authorId: integer('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const likes = pgTable(
  'likes',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('likes_post_user_idx').on(table.postId, table.userId)]
);

export const savedPosts = pgTable(
  'saved_posts',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .references(() => posts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('saved_post_user_idx').on(table.postId, table.userId)]
);

export const follows = pgTable(
  'follows',
  {
    id: serial('id').primaryKey(),
    followerId: integer('follower_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    followingId: integer('following_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('follows_pair_idx').on(table.followerId, table.followingId)]
);

export const blocks = pgTable(
  'blocks',
  {
    id: serial('id').primaryKey(),
    blockerId: integer('blocker_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    blockedId: integer('blocked_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('blocks_pair_idx').on(table.blockerId, table.blockedId)]
);

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  collegeId: integer('college_id').references(() => colleges.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
});

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conv_member_idx').on(table.conversationId, table.userId),
  ]
);

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: integer('sender_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  recipientId: integer('recipient_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // 'follow' | 'like' | 'comment' | 'message' | 'verification' | 'moderation'
  entityId: integer('entity_id'),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetType: text('target_type').notNull(), // 'post' | 'comment' | 'user' | 'message'
  targetId: integer('target_id').notNull(),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  priority: text('priority').notNull().default('medium'), // 'low' | 'medium' | 'high'
  status: text('status').notNull().default('open'), // 'open' | 'reviewing' | 'resolved' | 'dismissed'
  resolutionNotes: text('resolution_notes').notNull().default(''),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id')
    .references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: integer('target_id'),
  reason: text('reason').notNull().default(''),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const collegesRelations = relations(colleges, ({ many }) => ({
  users: many(users),
  posts: many(posts),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  college: one(colleges, {
    fields: [users.collegeId],
    references: [colleges.id],
  }),
  posts: many(posts),
  comments: many(comments),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  college: one(colleges, {
    fields: [posts.collegeId],
    references: [colleges.id],
  }),
  attachments: many(postAttachments),
  comments: many(comments),
}));

export const postAttachmentsRelations = relations(postAttachments, ({ one }) => ({
  post: one(posts, {
    fields: [postAttachments.postId],
    references: [posts.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));
