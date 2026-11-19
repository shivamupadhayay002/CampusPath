import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { colleges, users } from './schema.ts';

export const PUBLIC_WEBMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'zoho.com',
  'gmx.com',
  'mail.com',
  'rediffmail.com',
]);

const DOMAIN_FORMAT_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function validateCollegeDomain(
  rawDomain: string
): { valid: true; domain: string } | { valid: false; error: string } {
  const domain = rawDomain.trim().toLowerCase().replace(/^@+/, '');
  if (!domain || domain.length > 253 || !DOMAIN_FORMAT_REGEX.test(domain)) {
    return {
      valid: false,
      error: `"${rawDomain}" is not a valid institutional domain format (e.g. college.edu).`,
    };
  }
  if (PUBLIC_WEBMAIL_DOMAINS.has(domain)) {
    return {
      valid: false,
      error: `Public consumer webmail domain "${domain}" cannot be registered as a college domain.`,
    };
  }
  return { valid: true, domain };
}

export function isInstitutionalDomain(domain: string): boolean {
  return validateCollegeDomain(domain).valid;
}

export function getConfiguredBootstrapAdminEmail(): string {
  return (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
}

async function findActiveCollegeByEmailDomain(emailDomain: string) {
  if (!isInstitutionalDomain(emailDomain)) {
    return null;
  }

  const activeColleges = await db
    .select()
    .from(colleges)
    .where(eq(colleges.status, 'active'));

  for (const col of activeColleges) {
    const normalizedDomains = (col.approvedDomains || [])
      .map((d) => d.trim().toLowerCase())
      .filter((d) => isInstitutionalDomain(d));
    if (normalizedDomains.includes(emailDomain)) {
      return col;
    }
  }
  return null;
}

export async function getOrCreateUser(params: {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}) {
  try {
    const normalizedEmail = params.email.toLowerCase().trim();
    const emailVerified = params.emailVerified === true;
    const bootstrapAdminEmail = getConfiguredBootstrapAdminEmail();
    const isBootstrapAdmin =
      emailVerified &&
      Boolean(bootstrapAdminEmail) &&
      normalizedEmail === bootstrapAdminEmail;

    const emailDomain = normalizedEmail.includes('@')
      ? normalizedEmail.split('@')[1]?.trim().toLowerCase() || ''
      : '';

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];

      // Only promote to bootstrap admin when email is verified and BOOTSTRAP_ADMIN_EMAIL matches.
      // Never auto-demote existing admins or previously verified users.
      if (
        isBootstrapAdmin &&
        (current.role !== 'admin' || current.verificationStatus !== 'verified')
      ) {
        const updated = await db
          .update(users)
          .set({
            role: 'admin',
            verificationStatus: 'verified',
            updatedAt: new Date(),
          })
          .where(eq(users.id, current.id))
          .returning();
        return updated[0];
      }

      // If an unverified user has now confirmed their institutional email via Firebase,
      // automatically verify them for the matching active college.
      if (emailVerified && current.verificationStatus === 'unverified' && emailDomain) {
        const matchedCollege = await findActiveCollegeByEmailDomain(emailDomain);
        if (matchedCollege) {
          const updated = await db
            .update(users)
            .set({
              verificationStatus: 'verified',
              collegeId: matchedCollege.id,
              collegeEmail: normalizedEmail,
              updatedAt: new Date(),
            })
            .where(eq(users.id, current.id))
            .returning();
          return updated[0];
        }
      }

      return current;
    }

    const matchedCollege =
      emailVerified && emailDomain
        ? await findActiveCollegeByEmailDomain(emailDomain)
        : null;

    const safeName =
      params.displayName?.trim() ||
      normalizedEmail.split('@')[0] ||
      'Campus Member';

    const assignedCollegeId = matchedCollege ? matchedCollege.id : null;
    const assignedCollegeEmail = matchedCollege ? normalizedEmail : null;
    const verificationStatus =
      isBootstrapAdmin || Boolean(matchedCollege) ? 'verified' : 'unverified';

    const result = await db
      .insert(users)
      .values({
        uid: params.uid,
        email: normalizedEmail,
        collegeEmail: assignedCollegeEmail,
        displayName: safeName,
        headline: isBootstrapAdmin
          ? 'CampusPath Administrator & Student Lead'
          : 'College Student',
        role: isBootstrapAdmin ? 'admin' : 'student',
        verificationStatus,
        collegeId: assignedCollegeId,
        branch: isBootstrapAdmin ? 'Computer Science & Engineering' : '',
        academicYear: isBootstrapAdmin ? 'Senior (4th Year)' : '',
        bio: isBootstrapAdmin
          ? 'Platform administrator supporting verified academic sharing, interview preparation, and peer mentorship.'
          : '',
        avatarUrl: params.avatarUrl || '',
        skills: isBootstrapAdmin
          ? ['System Design', 'TypeScript', 'Distributed Systems']
          : [],
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize member profile.', { cause: error });
  }
}

export async function getUserById(userId: number) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserById:', error);
    throw new Error('Failed to load member profile.', { cause: error });
  }
}
