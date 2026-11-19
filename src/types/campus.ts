export type UserRole = 'student' | 'faculty' | 'alumni' | 'moderator' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type PostCategory =
  | 'study_materials'
  | 'interview_prep'
  | 'jobs_internships'
  | 'student_stories'
  | 'projects_events'
  | 'announcements';

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  study_materials: 'Study Materials',
  interview_prep: 'Interview Prep',
  jobs_internships: 'Jobs & Internships',
  student_stories: 'Student Stories',
  projects_events: 'Projects & Events',
  announcements: 'Announcements',
};

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

export interface College {
  id: number;
  name: string;
  slug: string;
  approvedDomains: string[];
  location: string;
  description: string;
  status: string;
}

export interface UserProfile {
  id: number;
  displayName: string;
  headline: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  collegeId: number | null;
  branch: string;
  academicYear: string;
  bio: string;
  avatarUrl: string;
  linkedinUrl: string;
  email?: string;
  collegeEmail?: string | null;
  skills: string[];
  projects: ProjectItem[];
  achievements: AchievementItem[];
  privacySettings?: PrivacySettings;
  isRestricted?: boolean;
  isFollowing?: boolean;
  createdAt: string;
}

export interface PostAttachment {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'image' | 'document';
}

export interface PostItem {
  id: number;
  authorId: number;
  collegeId: number;
  category: PostCategory;
  title: string;
  content: string;
  tags: string[];
  contextLabel: string;
  externalLink: string;
  visibility: 'college' | 'public_preview' | 'followers';
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
  author: UserProfile | null;
  attachments: PostAttachment[];
  isLiked: boolean;
  isSaved: boolean;
  isFollowingAuthor: boolean;
}

export interface CommentItem {
  id: number;
  postId: number;
  authorId: number;
  content: string;
  createdAt: string;
  author: UserProfile | null;
}

export interface ConversationSummary {
  id: number;
  lastMessageAt: string;
  peer: UserProfile | null;
  lastMessage: {
    id: number;
    senderId: number;
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface MessageItem {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  recipientId: number;
  actorId: number | null;
  type: string;
  entityId: number | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminOverview {
  verifications: Array<{
    id: number;
    userId: number;
    collegeId: number;
    requestedRole: string;
    collegeEmail: string;
    method: string;
    evidenceNote: string;
    status: string;
    reviewNotes: string;
    createdAt: string;
    user: {
      id: number;
      displayName: string;
      email: string;
      branch: string;
    } | null;
  }>;
  reports: Array<{
    id: number;
    reporterId?: number;
    targetType: string;
    targetId: number;
    reason: string;
    details: string;
    priority: string;
    status: string;
    resolutionNotes: string;
    createdAt: string;
  }>;
  members: Array<{
    id: number;
    displayName: string;
    email: string;
    role: string;
    verificationStatus: string;
    collegeId: number | null;
    branch: string;
    isRestricted: boolean;
    createdAt: string;
  }>;
  colleges: College[];
  auditLogs: Array<{
    id: number;
    actorId: number | null;
    action: string;
    targetType: string;
    targetId: number | null;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}
