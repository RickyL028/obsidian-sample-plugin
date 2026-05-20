import { App, Modal, Setting } from 'obsidian';
import { TaskData } from './types';

// Returns today's date as a YYYY-MM-DD string in local time (timezone-safe).
function todayLocalStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export class TaskModal extends Modal {
    taskData: Partial<TaskData>;
    onSubmit: (result: Partial<TaskData>) => void;

    constructor(
        app: App,
        defaultData: Partial<TaskData> | null,
        defaultCategory: string = 'general',
        onSubmit: (result: Partial<TaskData>) => void
    ) {
        super(app);
        this.onSubmit = onSubmit;

        if (defaultData) {
            // Editing an existing task — preserve everything as-is.
            this.taskData = { ...defaultData };
        } else {
            // New task — seed smart defaults based on category.
            const isDailyCategory = defaultCategory === 'daily';
            this.taskData = {
                name: '',
                type: defaultCategory as TaskData['type'],
                // Daily tasks default to today so the repetition/visibility
                // logic has a concrete anchor to work from immediately.
                dueDate: isDailyCategory ? todayLocalStr() : '',
                repetition: isDailyCategory ? 'daily' : 'none',
                rewardXp: 10,
                rewardDiamond: 0,
                rewardGold: 0,
                rewardSilver: 0,
            };
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.taskData.name ? 'Edit Quest' : 'New Quest' });

        new Setting(contentEl)
            .setName('Task name')
            .addText(t =>
                t.setValue(this.taskData.name ?? '')
                 .onChange(v => (this.taskData.name = v))
            );

        // Due date — with a live date input for easier entry.
        let dueDateText: any;
        new Setting(contentEl)
            .setName('Due date')
            .setDesc('Leave blank for no due date')
            .addText(t => {
                dueDateText = t;
                t.inputEl.type = 'date';
                t.setValue(this.taskData.dueDate ?? '');
                t.onChange(v => (this.taskData.dueDate = v));
            });

        new Setting(contentEl)
            .setName('Task type')
            .addDropdown(d => {
                d.addOption('general',   'General (Inbox)');
                d.addOption('daily',     'Daily');
                d.addOption('weekly',    'Weekly');
                d.addOption('strategic', 'Strategic Goal');
                d.addOption('negative',  'Forbidden Action');
                d.setValue(this.taskData.type ?? 'general');
                d.onChange(v => {
                    this.taskData.type = v as TaskData['type'];
                    // When switching to daily, pre-fill today and switch
                    // repetition to daily if the user hasn't set one yet.
                    if (v === 'daily') {
                        if (!this.taskData.dueDate) {
                            this.taskData.dueDate = todayLocalStr();
                            dueDateText?.setValue(this.taskData.dueDate);
                        }
                        if (!this.taskData.repetition || this.taskData.repetition === 'none') {
                            this.taskData.repetition = 'daily';
                            repDropdown?.setValue('daily');
                        }
                    }
                });
            });

        let repDropdown: any;
        new Setting(contentEl)
            .setName('Repetition')
            .addDropdown(d => {
                repDropdown = d;
                d.addOption('none',        'None (one-off)');
                d.addOption('daily',       'Every day');
                d.addOption('weekly-mon',  'Every Monday');
                d.addOption('weekly-tue',  'Every Tuesday');
                d.addOption('weekly-wed',  'Every Wednesday');
                d.addOption('weekly-thu',  'Every Thursday');
                d.addOption('weekly-fri',  'Every Friday');
                d.addOption('weekly-sat',  'Every Saturday');
                d.addOption('weekly-sun',  'Every Sunday');
                d.setValue(this.taskData.repetition ?? 'none');
                d.onChange(v => {
                    this.taskData.repetition = v;
                    // If a weekly repeat is chosen and there's no due date,
                    // default to the next occurrence of that weekday.
                    if (v.startsWith('weekly-') && !this.taskData.dueDate) {
                        this.taskData.dueDate = nextWeekday(v);
                        dueDateText?.setValue(this.taskData.dueDate);
                    }
                    // If daily repeat is chosen and no due date, default to today.
                    if (v === 'daily' && !this.taskData.dueDate) {
                        this.taskData.dueDate = todayLocalStr();
                        dueDateText?.setValue(this.taskData.dueDate);
                    }
                });
            });

        contentEl.createEl('h3', { text: 'Rewards' });

        new Setting(contentEl).setName('XP').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardXp ?? 10));
            t.onChange(v => (this.taskData.rewardXp = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Diamonds 💎').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardDiamond ?? 0));
            t.onChange(v => (this.taskData.rewardDiamond = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Gold 🪙').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardGold ?? 0));
            t.onChange(v => (this.taskData.rewardGold = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Silver 🥈').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardSilver ?? 0));
            t.onChange(v => (this.taskData.rewardSilver = parseFloat(v) || 0));
        });

        new Setting(contentEl).addButton(btn =>
            btn.setButtonText('Save Quest').setCta().onClick(() => {
                if (!this.taskData.name?.trim()) return; // basic guard
                this.close();
                this.onSubmit(this.taskData);
            })
        );
    }

    onClose() {
        this.contentEl.empty();
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
    'weekly-sun': 0, 'weekly-mon': 1, 'weekly-tue': 2, 'weekly-wed': 3,
    'weekly-thu': 4, 'weekly-fri': 5, 'weekly-sat': 6,
};

/**
 * Returns the YYYY-MM-DD string for the next occurrence of the given weekday
 * (today inclusive — so if today is Monday and rep is weekly-mon, returns today).
 */
function nextWeekday(repetition: string): string {
    const target = WEEKDAY_MAP[repetition];
    if (target === undefined) return todayLocalStr();
    const d = new Date();
    const diff = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return localDateStr(d);
}

/** Formats a Date as YYYY-MM-DD in local time (avoids UTC-shift bugs). */
function localDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}