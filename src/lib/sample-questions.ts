/**
 * The built-in sample question bank (DEMO MODE ONLY).
 *
 * With no Supabase project configured there is no question bank to generate
 * against and no provider to call, so practice in demo mode draws from this
 * fixed, curated set. Three things are deliberate:
 *
 *  1. **These are labelled sample questions, never official ones.** They are
 *     written in the GATE style to exercise the MCQ/MSQ/NAT scoring engine —
 *     they are not past GATE questions, and nothing here claims a year, a paper
 *     code or an official answer key. `provenance: "sample"` is carried into
 *     every attempt so a stored paper always says where it came from.
 *  2. **The bank is small and the shortfall is reported, not hidden.** When a
 *     requested paper asks for more questions of a kind than the bank holds,
 *     the caller is told how many were available rather than being silently
 *     given a shorter paper.
 *  3. **No model is called and nothing is fabricated.** Every question, key and
 *     explanation below is fixed data. Demo mode must never simulate AI output.
 *
 * Answers here are curated and checkable by hand; `tests/sample-questions.test.ts`
 * asserts the bank passes the same `validateQuestion` rule book the store uses,
 * so an unusable entry cannot ship. `sampleQuestionsFor` preserves bank order,
 * which is what makes a demo paper reproducible between renders.
 */
import type { Question, QuestionKind } from "./quiz";
import type { PracticeDifficulty } from "./practice";

export interface SampleQuestion {
  branch: string;
  subject: string;
  topic: string;
  difficulty: PracticeDifficulty;
  question: Question;
}

/** Every sample question belongs to this branch. There is no GATE-mech bank. */
const BRANCH = "Computer Science";

export const SAMPLE_QUESTIONS: readonly SampleQuestion[] = [
  /* ---------------------------- Data Structures ------------------------- */
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Trees",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Which traversal of a binary search tree visits the keys in ascending order?",
      options: [
        { id: "A", text: "Preorder" },
        { id: "B", text: "Inorder" },
        { id: "C", text: "Postorder" },
        { id: "D", text: "Level order" },
      ],
      answer: ["B"],
      nat_range: null,
      explanation:
        "An inorder traversal visits the left subtree, then the node, then the right subtree. In a BST every left key is smaller and every right key is larger, so this order is ascending.",
    },
  },
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Hashing",
    difficulty: "medium",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "A hash table resolves collisions by chaining and is held at a load factor of 1. Under simple uniform hashing, what is the expected time for an unsuccessful search?",
      options: [
        { id: "A", text: "O(1)" },
        { id: "B", text: "O(log n)" },
        { id: "C", text: "O(n)" },
        { id: "D", text: "O(n log n)" },
      ],
      answer: ["A"],
      nat_range: null,
      explanation:
        "With chaining an unsuccessful search scans one full chain. The expected chain length is the load factor α, held constant at 1 here, so the expected cost is Θ(1 + α) = O(1).",
    },
  },
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Sorting",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Even with a median-of-three pivot rule, what is the worst-case time complexity of quicksort?",
      options: [
        { id: "A", text: "O(n)" },
        { id: "B", text: "O(n log n)" },
        { id: "C", text: "O(n²)" },
        { id: "D", text: "O(log n)" },
      ],
      answer: ["C"],
      nat_range: null,
      explanation:
        "Pivot choice changes which inputs are bad, not the worst case. An adversarial input can still split off one element per partition, giving O(n²).",
    },
  },
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Graphs",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 1,
      text: "What is the minimum number of edges in a connected undirected graph with n vertices?",
      options: [
        { id: "A", text: "n" },
        { id: "B", text: "n − 1" },
        { id: "C", text: "n + 1" },
        { id: "D", text: "2n" },
      ],
      answer: ["B"],
      nat_range: null,
      explanation:
        "A connected graph on n vertices needs at least n − 1 edges — exactly a spanning tree. Fewer edges would leave it disconnected.",
    },
  },
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Heaps",
    difficulty: "medium",
    question: {
      kind: "MSQ",
      marks: 2,
      text: "A min-heap is stored in an array with 0-based indexing. Which of the following statements are TRUE?",
      options: [
        { id: "A", text: "The minimum element is at index 0." },
        { id: "B", text: "The array is stored in sorted order." },
        { id: "C", text: "The children of the node at index i are at 2i + 1 and 2i + 2." },
        { id: "D", text: "Finding the maximum element takes O(1) time." },
      ],
      answer: ["A", "C"],
      nat_range: null,
      explanation:
        "A min-heap gives its minimum at the root (index 0) and stores the children of i at 2i+1 and 2i+2. It is not sorted — only the heap property holds. The maximum sits among the leaves and takes O(n) to find.",
    },
  },
  {
    branch: BRANCH,
    subject: "Data Structures & Algorithms",
    topic: "Trees",
    difficulty: "medium",
    question: {
      kind: "NAT",
      marks: 2,
      text: "The keys 10, 5, 15, 3, 7, 12, 18 are inserted in that order into an initially empty binary search tree. The height of the resulting tree, measured as the number of edges on the longest root-to-leaf path, is ______.",
      options: [],
      answer: null,
      nat_range: { min: 2, max: 2 },
      explanation:
        "10 is the root, 5 and 15 its children, 3 and 7 hang off 5, and 12 and 18 off 15. The longest root-to-leaf paths are 10→5→3 and 10→5→7, which use 2 edges.",
    },
  },

  /* --------------------------- Operating Systems ------------------------ */
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "Memory Management",
    difficulty: "medium",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "A process has 3 page frames. With the reference string 7, 0, 1, 2, 0, 3, 0, 4 and LRU replacement, how many page faults occur?",
      options: [
        { id: "A", text: "4" },
        { id: "B", text: "5" },
        { id: "C", text: "6" },
        { id: "D", text: "7" },
      ],
      answer: ["C"],
      nat_range: null,
      explanation:
        "Faults occur on 7, 0, 1 and 2 (evicting 7), then on 3 (evicting 1) and 4 (evicting 2). The two references to 0 both hit. That is 6 faults.",
    },
  },
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "CPU Scheduling",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Which CPU scheduling policy makes a long-running process most likely to starve?",
      options: [
        { id: "A", text: "First Come First Served" },
        { id: "B", text: "Shortest Job First" },
        { id: "C", text: "Round Robin" },
        { id: "D", text: "FCFS with no preemption" },
      ],
      answer: ["B"],
      nat_range: null,
      explanation:
        "Shortest Job First always picks the runnable job needing the least CPU, so on a busy system a long job can be deferred indefinitely. The other policies give every runnable process a turn eventually.",
    },
  },
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "Deadlocks",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Which of the following is NOT one of the four necessary conditions for deadlock?",
      options: [
        { id: "A", text: "Mutual exclusion" },
        { id: "B", text: "Hold and wait" },
        { id: "C", text: "Preemption of resources" },
        { id: "D", text: "Circular wait" },
      ],
      answer: ["C"],
      nat_range: null,
      explanation:
        "The fourth condition is *no* preemption — resources cannot be taken away. Preemption is a technique for preventing deadlock, so it is the opposite of the condition.",
    },
  },
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "Memory Management",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 1,
      text: "A process uses 5 contiguous pages and the page size is 4 KB. What is the size of its logical address space?",
      options: [
        { id: "A", text: "9 KB" },
        { id: "B", text: "16 KB" },
        { id: "C", text: "20 KB" },
        { id: "D", text: "25 KB" },
      ],
      answer: ["C"],
      nat_range: null,
      explanation:
        "5 pages × 4 KB per page = 20 KB. The address space is contiguous, so the sizes simply add.",
    },
  },
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "Processes and Threads",
    difficulty: "medium",
    question: {
      kind: "MSQ",
      marks: 2,
      text: "Which of the following statements about threads within a single process are TRUE?",
      options: [
        { id: "A", text: "Threads share the same address space." },
        { id: "B", text: "Each thread has its own program counter." },
        { id: "C", text: "Each thread has its own stack." },
        { id: "D", text: "Threads share one set of CPU registers." },
      ],
      answer: ["A", "B", "C"],
      nat_range: null,
      explanation:
        "Threads of one process share code, data and open files, but each needs its own program counter, stack and register set so that it can be scheduled independently. Registers are saved and restored per thread, so they are not shared.",
    },
  },
  {
    branch: BRANCH,
    subject: "Operating Systems",
    topic: "I/O Systems",
    difficulty: "medium",
    question: {
      kind: "NAT",
      marks: 2,
      text: "A disk rotates at 7200 RPM and has an average seek time of 5 ms. Ignoring transfer time, the average access time in milliseconds, rounded to the nearest integer, is ______.",
      options: [],
      answer: null,
      nat_range: { min: 9, max: 9 },
      explanation:
        "One rotation takes 60/7200 s = 8.33 ms. Average rotational latency is half a rotation, 4.17 ms, and average seek is 5 ms. 5 + 4.17 = 9.17 ms, which rounds to 9.",
    },
  },

  /* ------------------------ Database Management ------------------------- */
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "Normalisation",
    difficulty: "easy",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Which normal form removes transitive dependencies on a candidate key?",
      options: [
        { id: "A", text: "1NF" },
        { id: "B", text: "2NF" },
        { id: "C", text: "3NF" },
        { id: "D", text: "4NF" },
      ],
      answer: ["C"],
      nat_range: null,
      explanation:
        "1NF removes repeating groups and 2NF removes partial dependencies on part of a key. 3NF additionally removes transitive dependencies, where a non-key attribute depends on another non-key attribute.",
    },
  },
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "Normalisation",
    difficulty: "hard",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Relation R(A, B, C) has functional dependencies A → B and B → C, and A is its only candidate key. What is the highest normal form R satisfies?",
      options: [
        { id: "A", text: "1NF" },
        { id: "B", text: "2NF" },
        { id: "C", text: "3NF" },
        { id: "D", text: "BCNF" },
      ],
      answer: ["B"],
      nat_range: null,
      explanation:
        "The key A is a single attribute, so no partial dependency can exist and 2NF holds. But A → B → C makes C transitively dependent on the key, so 3NF fails — and 3NF must hold before BCNF can.",
    },
  },
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "Indexing",
    difficulty: "medium",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "In a B+ tree used as a database index, where are the pointers to the actual records stored?",
      options: [
        { id: "A", text: "Only in internal nodes" },
        { id: "B", text: "Only in leaf nodes" },
        { id: "C", text: "In both internal and leaf nodes" },
        { id: "D", text: "Only in the root node" },
      ],
      answer: ["B"],
      nat_range: null,
      explanation:
        "That is what distinguishes a B+ tree from a B tree: internal nodes hold keys only, for routing, while every record pointer lives in a leaf. The leaves are also linked, which is what makes range scans cheap.",
    },
  },
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "SQL",
    difficulty: "medium",
    question: {
      kind: "MCQ",
      marks: 2,
      text: "Which SQL clause is evaluated before GROUP BY in the logical order of query processing?",
      options: [
        { id: "A", text: "WHERE" },
        { id: "B", text: "HAVING" },
        { id: "C", text: "ORDER BY" },
        { id: "D", text: "SELECT" },
      ],
      answer: ["A"],
      nat_range: null,
      explanation:
        "The logical order is FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. WHERE filters individual rows before grouping, which is why an aggregate cannot appear in it — that is what HAVING is for.",
    },
  },
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "Transactions",
    difficulty: "easy",
    question: {
      kind: "MSQ",
      marks: 2,
      text: "Which of the following are ACID properties of a database transaction?",
      options: [
        { id: "A", text: "Atomicity" },
        { id: "B", text: "Consistency" },
        { id: "C", text: "Isolation" },
        { id: "D", text: "Durability" },
      ],
      answer: ["A", "B", "C", "D"],
      nat_range: null,
      explanation:
        "ACID stands for Atomicity, Consistency, Isolation and Durability — all four options. Atomicity is all-or-nothing, Consistency preserves constraints, Isolation hides concurrent effects, and Durability survives a crash.",
    },
  },
  {
    branch: BRANCH,
    subject: "Database Management",
    topic: "Indexing",
    difficulty: "hard",
    question: {
      kind: "NAT",
      marks: 2,
      text: "An internal node of a B+ tree has order 4, meaning it may hold at most 4 pointers. The maximum number of keys such a node can hold is ______.",
      options: [],
      answer: null,
      nat_range: { min: 3, max: 3 },
      explanation:
        "A node with p pointers separates p subtrees, so it needs p − 1 keys between them. With p = 4 the maximum is 3 keys.",
    },
  },
];

/** What the caller wants to draw from the bank. Any field may be left open. */
export interface SampleFilter {
  branch?: string | null;
  subject?: string | null;
  /** `null`/omitted matches every topic in the subject. */
  topic?: string | null;
  /** `null`/omitted (or `"mixed"`) matches every difficulty. */
  difficulty?: PracticeDifficulty | null;
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Sample questions matching the filter, in bank order.
 *
 * Matching is case- and whitespace-insensitive, because the subject and topic
 * reach here from a free-text input with a `datalist` of suggestions — a
 * student who types "operating systems" means the same subject as the bank's.
 * Bank order is preserved so a demo paper is reproducible.
 */
export function sampleQuestionsFor(filter: SampleFilter = {}): SampleQuestion[] {
  return SAMPLE_QUESTIONS.filter((entry) => {
    if (filter.subject && !sameLabel(entry.subject, filter.subject)) return false;
    if (filter.branch && !sameLabel(entry.branch, filter.branch)) return false;
    if (filter.topic && !sameLabel(entry.topic, filter.topic)) return false;
    if (filter.difficulty && filter.difficulty !== "mixed" && entry.difficulty !== filter.difficulty) {
      return false;
    }
    return true;
  });
}

/** Distinct subjects held for a branch, in bank order. */
export function sampleSubjects(branch: string | null = BRANCH): string[] {
  const seen: string[] = [];
  for (const entry of SAMPLE_QUESTIONS) {
    if (branch && !sameLabel(entry.branch, branch)) continue;
    if (!seen.some((subject) => sameLabel(subject, entry.subject))) seen.push(entry.subject);
  }
  return seen;
}

/** Distinct topics held for a subject (every subject when omitted), in bank order. */
export function sampleTopics(subject?: string | null): string[] {
  const seen: string[] = [];
  for (const entry of SAMPLE_QUESTIONS) {
    if (subject && !sameLabel(entry.subject, subject)) continue;
    if (!seen.some((topic) => sameLabel(topic, entry.topic))) seen.push(entry.topic);
  }
  return seen;
}

/** How many sample questions of a kind a filter can supply. */
export function sampleCountFor(filter: SampleFilter, kind: QuestionKind): number {
  return sampleQuestionsFor(filter).filter((entry) => entry.question.kind === kind).length;
}

