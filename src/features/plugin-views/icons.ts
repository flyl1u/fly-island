import {
  Activity, Bell, BookOpen, Bookmark, Bug, Calendar, ChartColumn, CircleCheck, Clock, Cloud, Code, Coffee, FileText,
  Flame, Folder, Gauge, GitPullRequest, Globe, Hash, Heart, House, Inbox, Info, Kanban, Link, List, ListChecks, ListTodo,
  Mail, MessageSquare, Music, Newspaper, Notebook, Puzzle, Rocket, Rss, Search, Sparkles, SquareCheck, Star, Sun, Tag,
  Target, Terminal, Timer, Trophy, Zap, type LucideIcon,
} from "lucide-react";
import { isViewIconName, type ViewIconName } from "./iconNames.ts";

const ICONS: Record<ViewIconName, LucideIcon> = {
  list: List, "list-checks": ListChecks, "list-todo": ListTodo, kanban: Kanban, "square-check": SquareCheck,
  timer: Timer, clock: Clock, calendar: Calendar, bell: Bell, "book-open": BookOpen, bookmark: Bookmark, star: Star,
  heart: Heart, folder: Folder, "file-text": FileText, "git-pull-request": GitPullRequest, bug: Bug, code: Code,
  terminal: Terminal, cloud: Cloud, sun: Sun, music: Music, newspaper: Newspaper, rss: Rss, mail: Mail,
  "message-square": MessageSquare, globe: Globe, link: Link, activity: Activity, "chart-column": ChartColumn, zap: Zap,
  flame: Flame, coffee: Coffee, puzzle: Puzzle, gauge: Gauge, target: Target, trophy: Trophy, rocket: Rocket,
  sparkles: Sparkles, inbox: Inbox, tag: Tag, hash: Hash, search: Search, house: House, notebook: Notebook,
  "circle-check": CircleCheck, info: Info,
};

/** The icon for a name from a plugin; unknown names get the puzzle piece. */
export function viewIcon(name: string | null | undefined): LucideIcon {
  return isViewIconName(name) ? ICONS[name] : Puzzle;
}
