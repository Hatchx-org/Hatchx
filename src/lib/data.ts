export type Club = {
  id?: string;
  slug: string;
  name: string;
  category: string;
  tags?: string[];
  description: string;
  fullDescription?: string;
  mission?: string;
  activities?: string;
  whoShouldJoin?: string;
  membershipExpectations?: string;
  meetingDays: string[];
  meetingDate: string;
  meetingTime: string;
  location: string;
  commitment: number;
  communityService: boolean;
  stem: boolean;
  officers: { role: string; name: string; avatarUrl?: string }[];
  advisors?: { name: string; email?: string }[];
  activeStartDate?: string;
  activeEndDate?: string;
  googleClassroomCode?: string;
  links?: { id: string; platform: string; label: string; value: string }[];
  contactEmail?: string;
  joinPolicy?: "instant" | "approval_required";
  recruitingStatus?: "recruiting" | "paused" | "closed";
  announcements?: { id: string; title: string; body: string; date: string; image?: string; imageAlt?: string }[];
  media?: { id: string; type: "image" | "video" | "document"; path: string; title?: string; alt?: string }[];
  logo?: string;
  profileBackgroundColor?: string;
  profileAccentColor?: string;
};

export const clubCategories = [
  "Arts & Crafts",
  "STEM",
  "Community Service",
  "Publications",
  "Sports",
  "Music",
  "Culture & Language",
  "Debate & Government",
  "Business",
  "Other",
];

// Public fallback content never includes people; board names come only from Supabase.
export const clubs: Club[] = [
  {
    slug: "key-club",
    name: "Key Club",
    category: "Community Service",
    description:
      "Key Club is a student-led service organization that provides members with opportunities to provide service, build character, and develop leadership.",
    meetingDays: ["Mon"],
    meetingDate: "Every Monday",
    meetingTime: "3:00 PM – 4:00 PM",
    location: "Room 219",
    commitment: 3,
    communityService: true,
    stem: false,
    officers: [],
  },
  {
    slug: "crochet-club",
    name: "Crochet Club",
    category: "Arts & Crafts",
    description:
      "Learn to crochet, share your projects, and build a community around fiber arts. All skill levels welcome — supplies provided for beginners.",
    meetingDays: ["Thu", "Fri"],
    meetingDate: "Every Thursday & Friday",
    meetingTime: "3:15 PM – 4:15 PM",
    location: "Room 112",
    commitment: 2,
    communityService: false,
    stem: false,
    officers: [],
  },
  {
    slug: "robotics",
    name: "Robotics Club",
    category: "STEM",
    description:
      "Design, build, and program robots to compete in FIRST Tech Challenge. No experience required — we teach everything at meetings.",
    meetingDays: ["Tue", "Thu"],
    meetingDate: "Every Tuesday & Thursday",
    meetingTime: "3:00 PM – 5:00 PM",
    location: "Robotics Lab (Room 305)",
    commitment: 4,
    communityService: false,
    stem: true,
    officers: [],
  },
  {
    slug: "debate-team",
    name: "Debate Team",
    category: "Debate & Government",
    description:
      "Compete in local and citywide debate tournaments. Develop public speaking, research, and argumentation skills in a supportive team.",
    meetingDays: ["Wed"],
    meetingDate: "Every Wednesday",
    meetingTime: "3:15 PM – 4:30 PM",
    location: "Room 402",
    commitment: 3,
    communityService: false,
    stem: false,
    officers: [],
  },
  {
    slug: "school-newspaper",
    name: "School Newspaper",
    category: "Publications",
    description:
      "Write, edit, photograph, and design the student newspaper. Publish stories about our school community every month.",
    meetingDays: ["Mon", "Wed"],
    meetingDate: "Every Monday & Wednesday",
    meetingTime: "3:00 PM – 4:00 PM",
    location: "Room 218",
    commitment: 3,
    communityService: false,
    stem: false,
    officers: [],
  },
  {
    slug: "environmental",
    name: "Environmental Club",
    category: "Community Service",
    description:
      "Take action for a greener school: recycling drives, park cleanups, and awareness campaigns. Earn community service hours while making a difference.",
    meetingDays: ["Fri"],
    meetingDate: "Every Friday",
    meetingTime: "3:00 PM – 4:00 PM",
    location: "Room 108",
    commitment: 2,
    communityService: true,
    stem: false,
    officers: [],
  },
  {
    slug: "health-occupations",
    name: "Health Occupations Students of America",
    category: "STEM",
    description:
      "Explore careers in healthcare through competitions, guest speakers, and community health projects. Perfect for future doctors and nurses.",
    meetingDays: ["Tue"],
    meetingDate: "Every Tuesday",
    meetingTime: "3:15 PM – 4:15 PM",
    location: "Room 221",
    commitment: 2,
    communityService: true,
    stem: true,
    officers: [],
  },
  {
    slug: "art-club",
    name: "Art Club",
    category: "Arts & Crafts",
    description:
      "A space for artists of every medium to create, critique, and exhibit work together. Monthly gallery shows in the student cafeteria.",
    meetingDays: ["Thu"],
    meetingDate: "Every Thursday",
    meetingTime: "3:00 PM – 4:30 PM",
    location: "Art Studio (Room 130)",
    commitment: 3,
    communityService: false,
    stem: false,
    officers: [],
  },
];

export type Announcement = {
  id: string;
  title: string;
  tag: string;
  date: string;
  excerpt: string;
  imageUrl?: string;
  imageAlt?: string;
  priority?: "normal" | "important" | "urgent" | "emergency";
  pinned?: boolean;
};

export const announcements: Announcement[] = [
  {
    id: "fall-reminders",
    title: "Fall Semester Reminders",
    tag: "Announcements",
    date: "Mon, Nov 10",
    excerpt:
      "Browse daily announcements and check for new updates! We keep track of any events, dates, or activities that you might have missed this morning.",
  },
  {
    id: "club-fair",
    title: "Winter Club Fair",
    tag: "Clubs",
    date: "Fri, Nov 21",
    excerpt:
      "Meet over 80 clubs in the cafeteria during lunch. Talk to officers, join clubs, and get involved!",
  },
];

export type EventItem = {
  id: string;
  title: string;
  category: "events" | "sports";
  date: string;
  /** Machine-readable date (YYYY-MM-DD). `dateEndISO` marks multi-day events. */
  dateISO?: string;
  dateEndISO?: string;
  time: string;
  location: string;
  price: string;
  description: string;
  source?: "school" | "club" | "sports";
  calendarId?: string;
  calendarName?: string;
  calendarColor?: string;
  meetingEffect?: "all" | "club";
  affectedClubName?: string;
};

export const events: EventItem[] = [
  {
    id: "e1",
    title: "Homecoming Dance",
    category: "events",
    date: "Fri, Oct 9, 2026",
    dateISO: "2026-10-09",
    time: "7:00 PM – 10:00 PM",
    location: "Gymnasium",
    price: "$10",
    description: "Bayside hosts fun, engaging events for students to enjoy. Check out the date, time, location, and price.",
  },
  {
    id: "e2",
    title: "Winter Concert",
    category: "events",
    date: "Wed, Dec 16, 2026",
    dateISO: "2026-12-16",
    time: "6:30 PM – 8:30 PM",
    location: "Auditorium",
    price: "Free",
    description: "Join the band and chorus for a night of seasonal performances celebrating the winter season.",
  },
  {
    id: "s1",
    title: "Boys Basketball Tryouts",
    category: "sports",
    date: "Mon, Sep 14, 2026",
    dateISO: "2026-09-14",
    time: "3:30 PM – 5:30 PM",
    location: "Gymnasium B",
    price: "Free",
    description: "Find out when the next season is available & the sport's meeting dates, time, and location.",
  },
  {
    id: "s2",
    title: "Girls Volleyball",
    category: "sports",
    date: "Tue, Sep 15, 2026",
    dateISO: "2026-09-15",
    time: "3:30 PM – 5:00 PM",
    location: "Gymnasium A",
    price: "Free",
    description: "Spring season sign-ups open. View all sport tryout and meeting dates.",
  },
  {
    id: "e3",
    title: "Fall Club Fair",
    category: "events",
    date: "Fri, Sep 18, 2026",
    dateISO: "2026-09-18",
    time: "3:00 PM – 5:00 PM",
    location: "Cafeteria",
    price: "Free",
    description: "Meet club officers, explore activities, and find a group that fits your interests.",
  },
  {
    id: "e4",
    title: "Multicultural Festival",
    category: "events",
    date: "Sat, Oct 24, 2026",
    dateISO: "2026-10-24",
    time: "12:00 PM – 4:00 PM",
    location: "Courtyard",
    price: "Free",
    description: "Celebrate the cultures and communities represented throughout Bayside High School.",
  },
  {
    id: "e5",
    title: "College Planning Night",
    category: "events",
    date: "Thu, Oct 29, 2026",
    dateISO: "2026-10-29",
    time: "6:00 PM – 8:00 PM",
    location: "Auditorium",
    price: "Free",
    description: "Meet counselors and learn about applications, financial aid, and college programs.",
  },
  {
    id: "e6",
    title: "Community Service Day",
    category: "events",
    date: "Sat, Nov 7, 2026",
    dateISO: "2026-11-07",
    time: "9:00 AM – 2:00 PM",
    location: "Main Entrance",
    price: "Free",
    description: "Join school-wide volunteer projects with community partners and earn service hours.",
  },
  {
    id: "e7",
    title: "Spring Carnival",
    category: "events",
    date: "Sat, May 15, 2027",
    dateISO: "2027-05-15",
    time: "12:00 PM – 4:00 PM",
    location: "School Field",
    price: "Free",
    description: "Enjoy games, performances, and student organization booths at the annual carnival.",
  },
];

export function isEventUpcoming(event: EventItem, today = new Date()): boolean {
  const end = event.dateEndISO ?? event.dateISO;
  if (!end) return true;
  const todayISO = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  return end >= todayISO;
}

export type Opportunity = {
  id: string;
  title: string;
  type: string;
  date: string;
  description: string;
  eligibility?: string;
  applicationLink?: string;
};

export const opportunities: Opportunity[] = [
  {
    id: "o2",
    title: "SYEP Summer Youth Employment",
    type: "Internships",
    date: "Applications open Feb 1, 2027",
    description: "Get paid to work at community organizations across NYC this summer.",
  },
  {
    id: "o3",
    title: "CUNY College Now",
    type: "College Prep",
    date: "Spring 2027",
    description: "Take free college courses at CUNY campuses and earn credits while in high school.",
  },
  {
    id: "o4",
    title: "Community Food Drive",
    type: "Community Service",
    date: "Sat, Nov 7, 2026",
    description: "Earn service hours while collecting and sorting donations for local food pantries.",
  },
  {
    id: "o5",
    title: "Bayside Student Arts Discount",
    type: "Student Discounts",
    date: "2026–2027 school year",
    description: "Show a current Bayside student ID for participating local arts and cultural discounts.",
    eligibility: "Current Bayside High School students.",
  },
];

export const supportTopics = [
  {
    id: "constitution",
    title: "Club Constitution & Chartering",
    description: "How to write a constitution, file a charter, and get your club approved.",
  },
  {
    id: "funding",
    title: "Funding & Budget",
    description: "Request funding for club events, trips, and supplies through the SO office.",
  },
  {
    id: "room-booking",
    title: "Room & Space Booking",
    description: "Reserve rooms, the auditorium, and gym space for meetings and events.",
  },
  {
    id: "tech",
    title: "Technical Support",
    description: "Get help with Hatchx accounts, school email, and club pages.",
  },
];

/** URL-safe slug from a club/application name, e.g. "Chess Society!" -> "chess-society" */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
