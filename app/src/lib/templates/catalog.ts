// Templates: talk skeletons to start a talk from (spec §2). Structure only — no points,
// hints or sessions. The starter templates ship with the app; your own come in 005/03.
import type { SegmentKind } from '../project/types'

/** Colours a category can have; each has light and dark values in app.css (`--cat-<colour>`). */
export const CATEGORY_COLORS = ['blue', 'orange', 'teal', 'purple', 'pink', 'green', 'amber', 'red', 'indigo', 'slate'] as const
export type CategoryColor = (typeof CATEGORY_COLORS)[number]

export interface Category {
  id: string
  name: string
  color: CategoryColor
  /** A starter category: fixed name and colour (it can still be deleted and restored). */
  builtin: boolean
}

/** Category ids are plain strings: the starter ids below, `mine`, or `c_…` for yours. */
export type CategoryId = string

/** The seven starter categories, with fixed colours (epic 005). */
export const STARTER_CATEGORIES: readonly Category[] = [
  { id: 'conferences', name: 'Conferences & talks', color: 'blue', builtin: true },
  { id: 'demos', name: 'Product & demos', color: 'orange', builtin: true },
  { id: 'meetings', name: 'Meetings', color: 'teal', builtin: true },
  { id: 'workshops', name: 'Workshops & training', color: 'purple', builtin: true },
  { id: 'pitches', name: 'Pitches & proposals', color: 'pink', builtin: true },
  { id: 'teaching', name: 'Teaching & study', color: 'green', builtin: true },
  { id: 'speeches', name: 'Speeches & occasions', color: 'amber', builtin: true },
]

/** Where templates you save go by default. Yours to rename and recolour; it can't be deleted. */
export const DEFAULT_CATEGORY: Category = { id: 'mine', name: 'My templates', color: 'indigo', builtin: false }

export interface TemplateSegment {
  name: string
  kind: SegmentKind
  /** Whole seconds; for an open-ended segment, the estimate. */
  plannedSeconds: number
  openEnded: boolean
}

export interface Template {
  id: string
  name: string
  description: string
  category: CategoryId
  /** Shipped with the app, as opposed to saved by you. */
  builtin: boolean
  segments: TemplateSegment[]
}

export function templateSeconds(template: Template): number {
  return template.segments.reduce((sum, s) => sum + s.plannedSeconds, 0)
}

// Compact source for the starter templates: [name, kind, length, open-ended?].
// Lengths are minutes, or 'm:ss' strings for parts of a minute.
type Row = [string, SegmentKind, number | string, 'open'?]

function seconds(length: number | string): number {
  if (typeof length === 'number') return length * 60
  const [m, s] = length.split(':').map(Number)
  return m * 60 + s
}

function starter(id: string, category: CategoryId, name: string, description: string, rows: Row[]): Template {
  return {
    id: `builtin:${id}`,
    name,
    description,
    category,
    builtin: true,
    segments: rows.map(([n, kind, length, open]) => ({
      name: n,
      kind,
      plannedSeconds: seconds(length),
      openEnded: open === 'open',
    })),
  }
}

/** The 24 starter templates (epic 005 task 01). Each total matches the minutes in its name. */
export const STARTER_TEMPLATES: readonly Template[] = [
  starter('lightning-5', 'conferences', 'Lightning 5', 'One idea, no demo.', [
    ['Hook', 'intro', '0:30'],
    ['Idea', 'topic', '3:30'],
    ['Call to action', 'outro', 1],
  ]),
  starter('conference-20', 'conferences', 'Conference 20', 'Standard conference slot with a live demo.', [
    ['Intro', 'intro', 2],
    ['Problem', 'topic', 4],
    ['Solution', 'topic', 4],
    ['Live demo', 'demo', 5, 'open'],
    ['Takeaways', 'topic', 3],
    ['Wrap-up', 'outro', 2],
  ]),
  starter('keynote-30', 'conferences', 'Keynote 30', 'A story-led keynote: one big idea and three proofs.', [
    ['Story opener', 'intro', 3],
    ['Big idea', 'topic', 7],
    ['Three proofs', 'topic', 12],
    ['Vision', 'topic', 5],
    ['Close', 'outro', 3],
  ]),
  starter('talk-qa-45', 'conferences', 'Talk + Q&A 45', 'Three main points, a summary and time for questions.', [
    ['Intro', 'intro', 3],
    ['Point one', 'topic', 10],
    ['Point two', 'topic', 10],
    ['Point three', 'topic', 7],
    ['Summary', 'topic', 5],
    ['Q&A', 'outro', 10, 'open'],
  ]),
  starter('stakeholder-demo-15', 'demos', 'Stakeholder demo 15', 'Short context, long demo, clear ask.', [
    ['Context', 'intro', 2],
    ['Demo', 'demo', 8, 'open'],
    ['Results', 'topic', 3],
    ['Ask', 'outro', 2],
  ]),
  starter('sprint-review-30', 'demos', 'Sprint review 30', 'Show what shipped, how it went and what comes next.', [
    ['Sprint goal', 'intro', 3],
    ['What we shipped', 'demo', 10, 'open'],
    ['Metrics', 'topic', 5],
    ["What's next", 'topic', 7],
    ['Feedback', 'outro', 5],
  ]),
  starter('sales-demo-30', 'demos', 'Sales demo 30', 'Start from their needs, demo to them, agree next steps.', [
    ['Recap of their needs', 'intro', 5],
    ['Pain points', 'topic', 5],
    ['Demo', 'demo', 12, 'open'],
    ['Pricing', 'topic', 4],
    ['Next steps', 'outro', 4],
  ]),
  starter('product-launch-20', 'demos', 'Product launch 20', 'Why now, what it is, a demo and a customer story.', [
    ['Why now', 'intro', 3],
    ['What it is', 'topic', 5],
    ['Demo', 'demo', 6, 'open'],
    ['Customer story', 'topic', 3],
    ['Availability', 'outro', 3],
  ]),
  starter('stand-up-15', 'meetings', 'Stand-up 15', 'Quick round of updates and blockers.', [
    ['Check-in', 'intro', 1],
    ['Updates', 'topic', 10],
    ['Blockers', 'topic', 3],
    ['Wrap', 'outro', 1],
  ]),
  starter('team-meeting-30', 'meetings', 'Team meeting 30', 'Updates, a real discussion, and clear decisions and actions.', [
    ['Agenda', 'intro', 2],
    ['Updates', 'topic', 8],
    ['Discussion', 'topic', 15],
    ['Decisions', 'topic', 3],
    ['Actions', 'outro', 2],
  ]),
  starter('board-update-10', 'meetings', 'Board update 10', 'Headline first, then results, risks and the ask.', [
    ['Headline', 'intro', 1],
    ['Results', 'topic', 3],
    ['Risks', 'topic', 3],
    ['Ask', 'outro', 3],
  ]),
  starter('retrospective-45', 'meetings', 'Retrospective 45', 'Look back, find insights, agree actions.', [
    ['Set the stage', 'intro', 5],
    ['What happened', 'topic', 10],
    ['Insights', 'topic', 15],
    ['Actions', 'topic', 10],
    ['Close', 'outro', 5],
  ]),
  starter('workshop-45', 'workshops', 'Workshop 45', 'Teach, practise, discuss, with a break.', [
    ['Welcome', 'intro', 3],
    ['Concepts', 'topic', 10],
    ['Exercise', 'demo', 15, 'open'],
    ['Break', 'break', 5],
    ['Discussion', 'topic', 8],
    ['Close', 'outro', 4],
  ]),
  starter('training-60', 'workshops', 'Training 60', 'Explain, practise, take a break, review.', [
    ['Welcome', 'intro', 5],
    ['Concept', 'topic', 15],
    ['Practice', 'demo', 15, 'open'],
    ['Break', 'break', 5],
    ['Review', 'topic', 15],
    ['Close', 'outro', 5],
  ]),
  starter('webinar-45', 'workshops', 'Webinar 45', 'Two topics and plenty of time for questions.', [
    ['Welcome', 'intro', 3],
    ['Agenda', 'intro', 2],
    ['Topic one', 'topic', 12],
    ['Topic two', 'topic', 12],
    ['Q&A', 'outro', 12, 'open'],
    ['Close', 'outro', 4],
  ]),
  starter('elevator-pitch-2', 'pitches', 'Elevator pitch 2', 'Who you are, the problem, what you do, the ask.', [
    ['Who I am', 'intro', '0:20'],
    ['Problem', 'topic', '0:30'],
    ['What I do', 'topic', '0:40'],
    ['Ask', 'outro', '0:30'],
  ]),
  starter('investor-pitch-10', 'pitches', 'Investor pitch 10', 'The classic pitch: problem to ask in ten minutes.', [
    ['Problem', 'intro', 2],
    ['Solution', 'topic', 2],
    ['Market', 'topic', '1:30'],
    ['Traction', 'topic', '1:30'],
    ['Team', 'topic', 1],
    ['Ask', 'outro', 2],
  ]),
  starter('project-proposal-15', 'pitches', 'Project proposal 15', 'Context, the proposal, options, and the decision you need.', [
    ['Context', 'intro', 3],
    ['Proposal', 'topic', 5],
    ['Options', 'topic', 3],
    ['Costs & risks', 'topic', 2],
    ['Decision needed', 'outro', 2],
  ]),
  starter('lesson-50', 'teaching', 'Lesson 50', 'Recap, new material, an activity and a check.', [
    ['Recap', 'intro', 5],
    ['New material', 'topic', 20],
    ['Activity', 'demo', 15, 'open'],
    ['Check understanding', 'topic', 7],
    ['Homework', 'outro', 3],
  ]),
  starter('student-presentation-10', 'teaching', 'Student presentation 10', 'Background, findings and a conclusion.', [
    ['Intro', 'intro', 1],
    ['Background', 'topic', 2],
    ['Findings', 'topic', 4],
    ['Conclusion', 'topic', 2],
    ['Questions', 'outro', 1, 'open'],
  ]),
  starter('thesis-defence-45', 'teaching', 'Thesis defence 45', 'Question, method, results and conclusions, then questions.', [
    ['Intro', 'intro', 3],
    ['Research question', 'topic', 5],
    ['Method', 'topic', 8],
    ['Results', 'topic', 12],
    ['Conclusions', 'topic', 5],
    ['Questions', 'outro', 12, 'open'],
  ]),
  starter('wedding-toast-5', 'speeches', 'Wedding toast 5', 'Who you are, a story, the couple, the toast.', [
    ['Who I am', 'intro', '0:30'],
    ['A story', 'topic', 2],
    ['About the couple', 'topic', '1:30'],
    ['The toast', 'outro', 1],
  ]),
  starter('farewell-speech-7', 'speeches', 'Farewell speech 7', 'Memories, achievements and good wishes.', [
    ['Opening', 'intro', 1],
    ['Memories', 'topic', 3],
    ['Achievements', 'topic', 2],
    ['Good wishes', 'outro', 1],
  ]),
  starter('award-acceptance-3', 'speeches', 'Award acceptance 3', 'Thank people, say what it means, close.', [
    ['Thank you', 'intro', 1],
    ['What it means', 'topic', '1:30'],
    ['Close', 'outro', '0:30'],
  ]),
]
