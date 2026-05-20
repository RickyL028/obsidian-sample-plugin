import { App, TFile, normalizePath } from 'obsidian';
import { TaskData } from './types';

// ── Date helpers (all local-time, no UTC-shift risk) ─────────────────────────

/** Today as YYYY-MM-DD in local time. */
function todayLocalStr(): string {
    return localDateStr(new Date());
}

/** Formats any Date as YYYY-MM-DD in local time. */
function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string as a local-time Date.
 * Using new Date("YYYY-MM-DD") parses as UTC midnight and shifts the day
 * in timezones east of UTC (e.g. AEST = UTC+10 → one day behind).
 */
function parseLocalDate(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    const y = parts[0] || 0;
    const m = parts[1] || 1;
    const d = parts[2] || 1;
    return new Date(y, m - 1, d);
}

const WEEKDAY_MAP: Record<string, number> = {
    'weekly-sun': 0, 'weekly-mon': 1, 'weekly-tue': 2, 'weekly-wed': 3,
    'weekly-thu': 4, 'weekly-fri': 5, 'weekly-sat': 6,
};

// ── Visibility logic ─────────────────────────────────────────────────────────

/**
 * Determines whether a task should appear on the dashboard today.
 *
 * Non-repeating tasks:
 *   Show when not completed and (no dueDate OR dueDate <= today).
 *
 * Repeating tasks (daily / weekly-X):
 *   Never permanently marked completed — completing one just advances its
 *   dueDate to the next occurrence. Show when dueDate <= today.
 *   For weekly tasks this means the task is visible from its due Monday
 *   until the user completes it (which moves dueDate to next Monday).
 *   Missed weeks stay visible until completed — they don't silently disappear.
 */
function isTaskVisibleToday(task: TaskData, todayStr: string): boolean {
    if (task.repetition === 'none') {
        if (task.completed) return false;
        if (!task.dueDate) return true;       // no date → always show
        return task.dueDate <= todayStr;
    }

    // Repeating: show from the due date onward until the user completes it
    // (which resets dueDate to the next occurrence).
    if (!task.dueDate) return true;           // safety fallback
    return task.dueDate <= todayStr;
}

// ── TaskManager ──────────────────────────────────────────────────────────────

export class TaskManager {
    app: App;
    folderPath: string;

    constructor(app: App, folderPath: string) {
        this.app = app;
        this.folderPath = folderPath;
    }

    async ensureFolder() {
        const path = normalizePath(this.folderPath);
        if (!this.app.vault.getAbstractFileByPath(path)) {
            await this.app.vault.createFolder(path);
        }
    }

    // ── Read ────────────────────────────────────────────────────────────────

    async getTasks(): Promise<TaskData[]> {
        const todayStr = todayLocalStr();
        const tasks: TaskData[] = [];

        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!file.path.startsWith(this.folderPath + '/')) continue;

            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!fm?.isLv999Task) continue;

            const task: TaskData = {
                id:            file.basename,
                name:          fm.taskName   || file.basename,
                type:          fm.type       || 'general',
                dueDate:       fm.dueDate    || '',
                repetition:    fm.repetition || 'none',
                rewardXp:      fm.rewardXp      ?? 0,
                rewardDiamond: fm.rewardDiamond ?? 0,
                rewardGold:    fm.rewardGold    ?? 0,
                rewardSilver:  fm.rewardSilver  ?? 0,
                completed:     fm.completed  || false,
                file,
            };

            if (isTaskVisibleToday(task, todayStr)) {
                tasks.push(task);
            }
        }

        return tasks;
    }

    // ── Create ──────────────────────────────────────────────────────────────

    async createTask(data: Partial<TaskData>) {
        await this.ensureFolder();

        // Smart defaults: daily tasks without an explicit date get today.
        let dueDate = data.dueDate || '';
        if (!dueDate && (data.type === 'daily' || data.repetition === 'daily')) {
            dueDate = todayLocalStr();
        }

        const content = `---
isLv999Task: true
taskName: "${data.name}"
type: ${data.type || 'general'}
dueDate: "${dueDate}"
repetition: "${data.repetition || 'none'}"
rewardXp: ${data.rewardXp ?? 10}
rewardDiamond: ${data.rewardDiamond ?? 0}
rewardGold: ${data.rewardGold ?? 0}
rewardSilver: ${data.rewardSilver ?? 0}
completed: false
---

# ${data.name}
`;
        const filename = `Task_${Date.now()}.md`;
        await this.app.vault.create(
            normalizePath(`${this.folderPath}/${filename}`),
            content
        );
    }

    // ── Update ──────────────────────────────────────────────────────────────

    async updateTask(file: TFile, data: Partial<TaskData>) {
        await this.app.fileManager.processFrontMatter(file, fm => {
            fm.taskName      = data.name;
            fm.type          = data.type;
            fm.dueDate       = data.dueDate;
            fm.repetition    = data.repetition;
            fm.rewardXp      = data.rewardXp;
            fm.rewardDiamond = data.rewardDiamond;
            fm.rewardGold    = data.rewardGold;
            fm.rewardSilver  = data.rewardSilver;
        });
    }

    // ── Complete ─────────────────────────────────────────────────────────────

    async completeTask(task: TaskData) {
        if (task.repetition === 'none') {
            // One-off task: mark permanently completed.
            await this.app.fileManager.processFrontMatter(task.file, fm => {
                fm.completed = true;
            });
            return;
        }

        // Repeating task: advance dueDate to the next occurrence ON THE SAME
        // file. Never mark completed — the task persists until explicitly
        // deleted. This avoids orphan-file accumulation.
        const nextDate = this.getNextOccurrence(task);
        await this.app.fileManager.processFrontMatter(task.file, fm => {
            fm.dueDate = nextDate;
            // completed intentionally left as-is (false) so the task reappears
            // on schedule without any extra logic.
        });
    }

    /**
     * Returns the YYYY-MM-DD string of the next scheduled occurrence.
     *
     * For daily tasks: tomorrow.
     * For weekly-X tasks: the next calendar occurrence of day X after today
     *   (always at least tomorrow, so completing on the due day gives +7 days).
     */
    private getNextOccurrence(task: TaskData): string {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (task.repetition === 'daily') {
            const next = new Date(today);
            next.setDate(today.getDate() + 1);
            return localDateStr(next);
        }

        if (task.repetition.startsWith('weekly-')) {
            const targetDay = WEEKDAY_MAP[task.repetition];
            if (targetDay === undefined) {
                // Unknown pattern — fall back to +7
                const next = new Date(today);
                next.setDate(today.getDate() + 7);
                return localDateStr(next);
            }
            // Start searching from tomorrow so same-day completion → next week.
            const next = new Date(today);
            next.setDate(today.getDate() + 1);
            while (next.getDay() !== targetDay) {
                next.setDate(next.getDate() + 1);
            }
            return localDateStr(next);
        }

        // Fallback: shouldn't reach here for repetition !== 'none'
        const next = new Date(today);
        next.setDate(today.getDate() + 1);
        return localDateStr(next);
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    async deleteTask(file: TFile) {
        await this.app.vault.trash(file, true);
    }
}