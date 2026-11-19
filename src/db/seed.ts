import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  auditLogs,
  colleges,
  comments,
  follows,
  posts,
  reports,
  users,
  verificationRequests,
} from './schema.ts';

let seededOnce = false;

export async function ensureSeedData() {
  if (seededOnce) return;

  try {
    const existingColleges = await db.select({ value: count() }).from(colleges);
    if ((existingColleges[0]?.value ?? 0) > 0) {
      seededOnce = true;
      return;
    }

    const [apexCollege] = await db
      .insert(colleges)
      .values([
        {
          name: 'Apex Institute of Technology',
          slug: 'apex-institute-of-technology',
          approvedDomains: ['apex.edu', 'student.apex.edu', 'campuspath.edu'],
          location: 'Bengaluru, India',
          description:
            'Flagship pilot campus connecting undergraduate engineers, researchers, faculty advisors, and industry alumni.',
          status: 'active',
        },
        {
          name: 'Horizon School of Computing',
          slug: 'horizon-school-of-computing',
          approvedDomains: ['horizon.edu', 'cs.horizon.edu'],
          location: 'Hyderabad, India',
          description:
            'Partner campus cohort opening in Phase 4 expansion for computer science and data systems.',
          status: 'active',
        },
      ])
      .returning();

    const [aravind, meera, priya, drElena, rohanPending] = await db
      .insert(users)
      .values([
        {
          uid: 'seed_student_aravind',
          email: 'aravind.nair@student.apex.edu',
          collegeEmail: 'aravind.nair@student.apex.edu',
          displayName: 'Aravind Nair',
          headline: 'B.Tech CSE ’26 · Incoming SWE Intern · DSA & Backend Lead',
          role: 'student',
          verificationStatus: 'verified',
          collegeId: apexCollege.id,
          branch: 'Computer Science & Engineering',
          academicYear: 'Junior (3rd Year)',
          bio: 'Sharing structured OS, DBMS, and system design notes from semester prep alongside full interview round breakdowns.',
          avatarUrl: '/src/assets/images/avatar_student_one_1794991317567.jpg',
          linkedinUrl: 'https://www.linkedin.com/in/aravind-nair-campus',
          skills: ['Data Structures', 'Go', 'PostgreSQL', 'Operating Systems', 'System Design'],
          projects: [
            {
              id: 'proj-1',
              title: 'Distributed Quiz Engine',
              description:
                'WebSocket-backed live lab assessment runner supporting 400 concurrent students with automated grading.',
              techStack: ['TypeScript', 'PostgreSQL', 'WebSockets'],
            },
          ],
          achievements: [
            {
              id: 'ach-1',
              title: '1st Place — Campus Systems Hackathon',
              issuer: 'Apex ACM Student Chapter',
              date: '2026-02',
              description: 'Built an offline-first campus transit scheduler.',
            },
          ],
        },
        {
          uid: 'seed_student_meera',
          email: 'meera.kapoor@student.apex.edu',
          collegeEmail: 'meera.kapoor@student.apex.edu',
          displayName: 'Meera Kapoor',
          headline: 'ECE Senior ’26 · Embedded AI & Placement Cell Coordinator',
          role: 'student',
          verificationStatus: 'verified',
          collegeId: apexCollege.id,
          branch: 'Electronics & Communication',
          academicYear: 'Senior (4th Year)',
          bio: 'Curating verified placement prep checklists, microcontroller lab guides, and mock interview pairings for juniors.',
          avatarUrl: '/src/assets/images/avatar_student_two_1794991317128.jpg',
          linkedinUrl: 'https://www.linkedin.com/in/meera-kapoor-ece',
          skills: ['Embedded C', 'PyTorch', 'Verilog', 'Signal Processing', 'Technical Writing'],
          projects: [
            {
              id: 'proj-2',
              title: 'Edge Acoustic Fault Detector',
              description:
                'TinyML inference pipeline deployed on STM32 for campus lab equipment monitoring.',
              techStack: ['C++', 'TinyML', 'Python'],
            },
          ],
          achievements: [
            {
              id: 'ach-2',
              title: 'Dean’s Academic Merit List',
              issuer: 'Apex Institute of Technology',
              date: '2025-11',
              description: 'Top 3% cohort GPA across Semesters 1–6.',
            },
          ],
        },
        {
          uid: 'seed_alumni_priya',
          email: 'priya.sharma@alumni.apex.edu',
          collegeEmail: 'priya.sharma@alumni.apex.edu',
          displayName: 'Priya Sharma',
          headline: 'Software Engineer II at CloudScale · Apex Class of 2023',
          role: 'alumni',
          verificationStatus: 'verified',
          collegeId: apexCollege.id,
          branch: 'Computer Science & Engineering',
          academicYear: 'Alumni (Class of 2023)',
          bio: 'Happy to review resumes, share backend engineering interview patterns, and refer final-year Apex students for summer internships.',
          avatarUrl: '/src/assets/images/avatar_alumni_one_1794991317234.jpg',
          linkedinUrl: 'https://www.linkedin.com/in/priya-sharma-swe',
          skills: ['Distributed Systems', 'Java', 'Kubernetes', 'Resume Reviews', 'Mock Interviews'],
          projects: [],
          achievements: [
            {
              id: 'ach-3',
              title: 'Alumni Mentorship Circle Lead',
              issuer: 'Apex Alumni Association',
              date: '2026-01',
              description: 'Mentored 28 graduating students through technical interviews.',
            },
          ],
        },
        {
          uid: 'seed_faculty_elena',
          email: 'elena.mathews@apex.edu',
          collegeEmail: 'elena.mathews@apex.edu',
          displayName: 'Dr. Elena Mathews',
          headline: 'Associate Professor of Computer Systems · Faculty Advisor',
          role: 'faculty',
          verificationStatus: 'verified',
          collegeId: apexCollege.id,
          branch: 'Computer Science & Engineering',
          academicYear: 'Faculty',
          bio: 'Teaching CS304 Operating Systems and CS412 Distributed Computing. Posting annotated lecture summaries and research openings.',
          avatarUrl: '/src/assets/images/avatar_faculty_one_1794991317805.jpg',
          skills: ['Operating Systems', 'Database Internals', 'Research Supervision'],
          projects: [],
          achievements: [],
        },
        {
          uid: 'seed_student_rohan_pending',
          email: 'rohan.verma.personal@gmail.com',
          collegeEmail: 'rohan.verma@student.apex.edu',
          displayName: 'Rohan Verma',
          headline: 'Sophomore Mechanical Engineering · Robotics Club',
          role: 'student',
          verificationStatus: 'pending',
          collegeId: apexCollege.id,
          branch: 'Mechanical Engineering',
          academicYear: 'Sophomore (2nd Year)',
          bio: 'Joining CampusPath to access CAD study sheets and collaborate on autonomous rover electronics.',
          avatarUrl: '',
          skills: ['SolidWorks', 'ROS2', 'C++'],
          projects: [],
          achievements: [],
        },
      ])
      .returning();

    const createdPosts = await db
      .insert(posts)
      .values([
        {
          authorId: aravind.id,
          collegeId: apexCollege.id,
          category: 'interview_prep',
          title: 'How I cracked the Backend SWE Summer Internship (4 Rounds Breakdown)',
          content: `Sharing my complete timeline and question patterns from last week's interview loop so juniors don't have to piece things together from scattered chats:\n\n1. Online Assessment (75 mins): Two medium graph/DP problems focusing on shortest path with state compression and interval merging.\n2. Technical Round 1 (DSA + Debugging): Sliding window rate-limiter implementation in Go/TypeScript, plus tracing a subtle concurrency deadlock.\n3. Technical Round 2 (Low-Level Design & DB): Designed a URL shortener + click analytics schema in PostgreSQL with proper B-tree indexing and idempotency keys.\n4. Hiring Manager Round: Deep dive into my Distributed Quiz Engine project—especially failure recovery when a client disconnects mid-exam.\n\nKey takeaway: Explain trade-offs before writing code, and keep your SQL normalization & transaction isolation notes sharp.`,
          tags: ['backend', 'internship-prep', 'sql', 'system-design'],
          contextLabel: 'CloudScale · SWE Intern Loop',
          visibility: 'public_preview',
          likesCount: 24,
          commentsCount: 2,
        },
        {
          authorId: drElena.id,
          collegeId: apexCollege.id,
          category: 'study_materials',
          title: 'CS304 Operating Systems — Midterm Revision Packet & Virtual Memory Cheat Sheet',
          content: `Uploaded the consolidated midterm guide covering Page Tables, TLB shootdowns, Deadlock Avoidance (Banker's Algorithm), and Mutex vs. Semaphore pitfalls.\n\nFocus areas for Friday's assessment:\n• Multi-level page table address translation math\n• Producer-Consumer bounded buffer race conditions\n• Disk scheduling vs NVMe queue architectures\n\nFeel free to reply in the comments with any practice problems you'd like walked through during Thursday office hours.`,
          tags: ['cs304', 'operating-systems', 'midterm-notes', 'faculty-verified'],
          contextLabel: 'CS304 · Fall Midterm',
          visibility: 'public_preview',
          likesCount: 41,
          commentsCount: 1,
        },
        {
          authorId: priya.id,
          collegeId: apexCollege.id,
          category: 'jobs_internships',
          title: '2026 New Grad & Summer Intern Referrals — Backend & Platform Engineering',
          content: `Our platform engineering team just opened 6 summer internship seats and 4 new-grad SWE roles for 2026 graduates.\n\nWhat we look for in student profiles:\n• Solid fundamentals in data structures, HTTP APIs, and relational modeling\n• At least 1–2 genuine engineering projects where you measured performance or fixed real bugs\n• Clear problem-solving communication\n\nSend me a direct message on CampusPath with your 1-page PDF resume link, target role, and 3 lines on a technical challenge you solved recently.`,
          tags: ['referrals', 'new-grad', 'summer-2026', 'alumni'],
          contextLabel: 'CloudScale · Deadline Dec 10',
          externalLink: 'https://careers.example.edu/cloudscale-2026',
          visibility: 'public_preview',
          likesCount: 53,
          commentsCount: 1,
        },
        {
          authorId: meera.id,
          collegeId: apexCollege.id,
          category: 'study_materials',
          title: 'DBMS Normalization, B+ Trees & Transaction Isolation — 14-Page Handwritten Digest',
          content: `Put together a clean exam-ready summary for Database Management Systems (CS302). Covers 1NF through BCNF decomposition proofs, serializability conflict graphs, MVCC snapshots in PostgreSQL, and 25 past-paper short questions with step-by-step solutions.`,
          tags: ['dbms', 'postgresql', 'cs302', 'exam-prep'],
          contextLabel: 'CS302 · Database Systems',
          visibility: 'college',
          likesCount: 19,
          commentsCount: 0,
        },
        {
          authorId: meera.id,
          collegeId: apexCollege.id,
          category: 'projects_events',
          title: 'Campus Systems & Hardware Build Weekend — Team Finder Thread',
          content: `We are hosting a 36-hour campus build sprint next Saturday in Innovation Hall B. Looking for 2 more frontend/UI designers and 1 embedded firmware student to join existing teams.\n\nMentors from 4 alumni startups will be reviewing architectures on Sunday afternoon.`,
          tags: ['hackathon', 'hardware', 'team-finder', 'campus-event'],
          contextLabel: 'Innovation Hall B · Nov 28',
          visibility: 'college',
          likesCount: 15,
          commentsCount: 0,
        },
        {
          authorId: aravind.id,
          collegeId: apexCollege.id,
          category: 'student_stories',
          title: 'What failing 3 early OAs taught me about structured interview prep',
          content: `In second year I jumped straight into random hard problems without mastering patterns or time management. Switching to a disciplined 6-week topic roadmap—writing out edge cases on paper first and doing weekly 45-minute peer mocks with two classmates—changed everything.\n\nIf you're feeling overwhelmed by placement season, find one accountability partner on CampusPath and track progress together.`,
          tags: ['reflection', 'peer-learning', 'placements'],
          contextLabel: 'Student Journey',
          visibility: 'public_preview',
          likesCount: 32,
          commentsCount: 0,
        },
      ])
      .returning();

    await db.insert(comments).values([
      {
        postId: createdPosts[0].id,
        authorId: meera.id,
        content:
          'The concurrency debugging section is super helpful! Did they ask you to write unit tests for the rate limiter as well?',
      },
      {
        postId: createdPosts[0].id,
        authorId: aravind.id,
        content:
          'Yes—we wrote two quick table-driven test cases covering burst refill edge cases and concurrent goroutine safety.',
      },
      {
        postId: createdPosts[1].id,
        authorId: aravind.id,
        content:
          'Thank you Dr. Mathews! The multi-level page table walkthrough cleared up the 4KB vs 4MB frame calculation.',
      },
      {
        postId: createdPosts[2].id,
        authorId: meera.id,
        content:
          'Sharing this with our 4th-year ECE/CSE placement prep group right away. Thank you for mentoring!',
      },
    ]);

    await db.insert(follows).values([
      { followerId: aravind.id, followingId: priya.id },
      { followerId: aravind.id, followingId: drElena.id },
      { followerId: meera.id, followingId: priya.id },
    ]);

    await db.insert(verificationRequests).values([
      {
        userId: rohanPending.id,
        collegeId: apexCollege.id,
        requestedRole: 'student',
        collegeEmail: 'rohan.verma@student.apex.edu',
        method: 'admin_review',
        evidenceNote:
          'Signed up with personal Gmail while waiting for campus IT mailbox activation; student ID #AIT-2025-ME-114.',
        status: 'pending',
      },
    ]);

    await db.insert(reports).values([
      {
        reporterId: meera.id,
        targetType: 'post',
        targetId: createdPosts[4].id,
        reason: 'Duplicate event announcement check',
        details:
          'Sample moderation queue item: confirming whether team-finder threads should be pinned under Announcements or Projects & Events.',
        priority: 'low',
        status: 'open',
      },
    ]);

    await db.insert(auditLogs).values([
      {
        actorId: drElena.id,
        action: 'PILOT_COLLEGE_INITIALIZED',
        targetType: 'college',
        targetId: apexCollege.id,
        reason: 'Initial pilot setup for Apex Institute of Technology',
        metadata: { approvedDomains: apexCollege.approvedDomains },
      },
    ]);

    seededOnce = true;
  } catch (error) {
    console.error('Failed to seed CampusPath database:', error);
  }
}
