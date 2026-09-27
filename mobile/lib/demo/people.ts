// Demo cast for demo mode. The ONLY place demo people are defined: screens never hardcode people,
// they call lib/api, which routes to lib/demo/backend.ts in demo mode. Same shapes as docs/api.md.
import type { Facet, SharedTopic } from '../api';

export const DEMO_ME = '00000000-0000-4000-8000-00000000d000';
export const DEMO_EVENT = { id: 1, name: 'HackGT 13', venue: 'Klaus Advanced Computing Building, Georgia Tech' };

export type Band = 'immediate' | 'near' | 'far';

export interface DemoPerson {
  user_id: string;
  name: string;
  role: 'student' | 'recruiter';
  headline: string;
  school: string;
  bio: string;
  skills: string[];
  goals: string;
  seeking: string;
  offering: string;
  score: number;
  band: Band;
  shared: SharedTopic[];
  facet_overlap: Record<Facet, number>;
  complementarity: number;
  why: string;
  openers: string[];
  /** Scripted replies in chat, in order. */
  replies: string[];
  /** Whether this person also says yes (to meeting and to connecting) in the demo. */
  saysYes: boolean;
}

let topicId = 100;
const t = (name: string, facet: Facet, strength: number, evidence: string): SharedTopic => ({
  interest_id: ++topicId,
  name,
  facet,
  strength,
  evidence,
});

export const DEMO_PEOPLE: DemoPerson[] = [
  {
    user_id: '00000000-0000-4000-8000-00000000d101',
    name: 'Maya Patel',
    role: 'student',
    headline: 'ML + HCI · building AI tutors',
    school: 'Georgia Tech, CS ’27',
    bio: 'Building a RAG-powered study assistant for intro CS courses. Looking for an AI internship next summer.',
    skills: ['Python', 'PyTorch', 'LangChain', 'React'],
    goals: 'AI/ML internship for summer 2027',
    seeking: 'People who have shipped retrieval systems; AI internship leads',
    offering: 'User research for AI tools, RAG evaluation experience',
    score: 0.87,
    band: 'immediate',
    shared: [
      t('retrieval-augmented generation', 'technical', 0.92, 'Built a RAG evaluation harness for a course-help chatbot'),
      t('AI internships', 'career', 0.85, 'Looking for a summer 2027 AI/ML internship'),
      t('Python', 'technical', 0.8, 'Most of her repos are Python (PyTorch, FastAPI)'),
      t('education technology', 'personal', 0.74, 'TA for CS 1301; building an AI tutor for it'),
    ],
    facet_overlap: { technical: 0.91, career: 0.78, academic: 0.64, personal: 0.52 },
    complementarity: 0.62,
    why: 'You both build retrieval (RAG) systems and want AI internships. She has evaluated RAG answers with real students, which is exactly what your project is missing.',
    openers: [
      'Ask Maya how she measures retrieval quality in her RAG evaluation harness. You’ve built retrieval too, so compare what worked.',
      'Maya is building an AI tutor for CS 1301. Ask what students actually trust the tutor with, and what they don’t.',
      'You’re both hunting for AI internships. Ask which teams she’s talked to at HackGT and swap notes.',
    ],
    replies: [
      'Hey! Yes, would love to. I’m by the sponsor tables near the Klaus atrium.',
      'Perfect, I’m wearing a yellow HackGT hoodie. See you in 5!',
      'Great talking with you. Send me that eval notebook when you get a chance!',
    ],
    saysYes: true,
  },
  {
    user_id: '00000000-0000-4000-8000-00000000d102',
    name: 'Daniel Kim',
    role: 'student',
    headline: 'Quant + stats · algorithmic trading',
    school: 'Georgia Tech, Math ’26',
    bio: 'Backtesting market-making strategies and teaching myself stochastic calculus. Into poker theory.',
    skills: ['Python', 'NumPy', 'pandas', 'C++'],
    goals: 'Quant research internship',
    seeking: 'People doing time-series ML or RL for trading',
    offering: 'Backtesting frameworks, probability puzzles',
    score: 0.74,
    band: 'near',
    shared: [
      t('reinforcement learning', 'technical', 0.71, 'Tried an RL market-making agent in his backtester'),
      t('Python', 'technical', 0.7, 'Backtester written in Python and C++'),
      t('statistics', 'academic', 0.62, 'Math major, stats concentration'),
    ],
    facet_overlap: { technical: 0.76, career: 0.58, academic: 0.69, personal: 0.3 },
    complementarity: 0.55,
    why: 'You both work with reinforcement learning in Python. Daniel applies it to trading, so he can show you how RL behaves on noisy real-world data.',
    openers: [
      'Ask Daniel how he kept his RL market-making agent from overfitting to one market regime.',
      'Daniel built his own backtester. Ask what he’d do differently if he started over.',
    ],
    replies: ['Hey! Sounds good, I’m at the quant sponsor booth.', 'Nice meeting you!'],
    saysYes: true,
  },
  {
    user_id: '00000000-0000-4000-8000-00000000d103',
    name: 'Sara Chen',
    role: 'student',
    headline: 'Frontend · React Native · design systems',
    school: 'Georgia Tech, CM ’26',
    bio: 'Design-systems nerd. Shipping a React Native app for campus clubs this semester.',
    skills: ['TypeScript', 'React Native', 'Figma', 'Expo'],
    goals: 'Frontend or design-engineering role',
    seeking: 'Backend and AI folks to team up with',
    offering: 'UI/UX reviews, React Native help',
    score: 0.68,
    band: 'near',
    shared: [
      t('React Native', 'technical', 0.66, 'Shipping a campus-clubs app in Expo'),
      t('education technology', 'personal', 0.48, 'Mentors first-year CS students'),
    ],
    facet_overlap: { technical: 0.64, career: 0.41, academic: 0.37, personal: 0.49 },
    complementarity: 0.71,
    why: 'Sara builds polished React Native apps and wants backend and AI teammates, which is what you bring. A strong complementary match.',
    openers: [
      'Ask Sara how she structures a design system in React Native so it stays consistent across screens.',
      'Sara is looking for AI teammates. Tell her what you’re building and ask what UI she’d give it.',
    ],
    replies: ['Hi! Happy to meet, I’m by the hardware lab.'],
    saysYes: true,
  },
  {
    user_id: '00000000-0000-4000-8000-00000000d104',
    name: 'Jordan Reyes',
    role: 'recruiter',
    headline: 'University recruiter · fintech startup',
    school: 'Recruiting for SWE and ML interns',
    bio: 'Hiring ML and backend interns for summer 2027. Happy to review resumes at the booth.',
    skills: ['Technical recruiting', 'ML hiring'],
    goals: 'Meet ML and backend intern candidates',
    seeking: 'Students with applied ML or backend projects',
    offering: 'Summer 2027 ML and SWE internships',
    score: 0.63,
    band: 'far',
    shared: [
      t('AI internships', 'career', 0.8, 'Hiring summer 2027 ML interns'),
      t('Python', 'technical', 0.45, 'Team stack is Python and Go'),
    ],
    facet_overlap: { technical: 0.4, career: 0.86, academic: 0.2, personal: 0.15 },
    complementarity: 0.8,
    why: 'Jordan is hiring ML interns for next summer, and your RAG project is exactly the applied ML work their team looks for.',
    openers: [
      'Ask Jordan what a strong ML intern project looks like to their team, then walk them through your RAG project in two sentences.',
      'Ask Jordan what the interview process looks like for ML interns and when applications open.',
    ],
    replies: ['Thanks for reaching out! Come by the booth anytime before 4.'],
    saysYes: true,
  },
  {
    user_id: '00000000-0000-4000-8000-00000000d105',
    name: 'Priya Raman',
    role: 'student',
    headline: 'HCI · accessibility research',
    school: 'Georgia Tech, HCI MS',
    bio: 'Researching accessible interfaces for screen-reader users in AI chat apps.',
    skills: ['User research', 'Swift', 'Python'],
    goals: 'PhD in HCI',
    seeking: 'Engineers building AI chat interfaces',
    offering: 'Accessibility audits, study design',
    score: 0.57,
    band: 'far',
    shared: [t('education technology', 'personal', 0.5, 'Studies how students use AI chat tools')],
    facet_overlap: { technical: 0.35, career: 0.3, academic: 0.62, personal: 0.44 },
    complementarity: 0.66,
    why: 'Priya studies how people actually use AI chat interfaces, which could make your assistant usable for everyone.',
    openers: ['Ask Priya what most AI chat apps get wrong for screen-reader users.'],
    replies: ['Hi! Would love to chat about it.'],
    saysYes: true,
  },
];

export function findPerson(userId: string): DemoPerson | undefined {
  return DEMO_PEOPLE.find((p) => p.user_id === userId);
}

export const DEMO_MY_INTERESTS: { name: string; facet: Facet; weight: number; source: string; evidence: string }[] = [
  { name: 'retrieval-augmented generation', facet: 'technical', weight: 0.93, source: 'github', evidence: 'Repo: course-rag, a retrieval pipeline over lecture notes' },
  { name: 'Python', facet: 'technical', weight: 0.88, source: 'github', evidence: '12 of your 15 recent repos are Python' },
  { name: 'reinforcement learning', facet: 'technical', weight: 0.7, source: 'resume', evidence: 'Resume: RL agent for a trading simulation (CS 4641)' },
  { name: 'React Native', facet: 'technical', weight: 0.62, source: 'github', evidence: 'Repo: formal-connection (Expo app)' },
  { name: 'AI internships', facet: 'career', weight: 0.85, source: 'manual', evidence: 'You wrote: “looking for an AI internship”' },
  { name: 'education technology', facet: 'personal', weight: 0.6, source: 'manual', evidence: 'You wrote: “I tutor intro CS”' },
  { name: 'statistics', facet: 'academic', weight: 0.5, source: 'resume', evidence: 'Coursework: MATH 3670 Statistics' },
];
