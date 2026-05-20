import { App, Modal, Setting, Notice, requestUrl } from 'obsidian';
import { TaskData } from './types';
import Lv999Plugin from './main';

// Returns today's date as a YYYY-MM-DD string in local time (timezone-safe).
function todayLocalStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export class TaskModal extends Modal {
    plugin: Lv999Plugin;
    taskData: Partial<TaskData>;
    onSubmit: (result: Partial<TaskData>) => void;

    constructor(
        app: App,
        plugin: Lv999Plugin,
        defaultData: Partial<TaskData> | null,
        defaultCategory: string = 'general',
        onSubmit: (result: Partial<TaskData>) => void
    ) {
        super(app);
        this.plugin = plugin;
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

    async evaluateRewardsWithGemma(
        apiKey: string,
        questName: string,
        questType: string,
        repetition: string
    ): Promise<{ rewardXp: number; rewardGold: number; rewardSilver: number } | null> {
        const MODEL = "gemma-4-31b-it";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

        const body = {
    contents: [
        {
            parts: [
                {
                    text: `You are a reward calculator for an RPG productivity game. Output ONLY a JSON object — no prose, no markdown, no bullet points.

Task Name: "${questName}"
Task Category/Type: "${questType}"
Repetition: "${repetition}"

Rules:
- rewardXp: integer 5–100 (higher for harder/strategic tasks, lower for easy/daily)
- rewardGold: integer 0–50
- rewardSilver: integer 0–100
- Reference: daily flashcards = 5 XP + 5 silver; past paper = 10 XP + 1 gold + 2 silver; 5 min study = 1 XP + 2 silver; chapter notes = 15 XP + 1 gold + 5 silver; reviewing a mistake = 1 XP + 1 silver.

Respond with exactly this structure and nothing else:
{"rewardXp": <number>, "rewardGold": <number>, "rewardSilver": <number>}`
                }
            ]
        }
    ],
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: "OBJECT",
            properties: {
                rewardXp:     { type: "INTEGER" },
                rewardGold:   { type: "INTEGER" },
                rewardSilver: { type: "INTEGER" }
            },
            required: ["rewardXp", "rewardGold", "rewardSilver"]
        }
    }
};

        const response = await requestUrl({
            url: url,
            method: 'POST',
            contentType: 'application/json',
            body: JSON.stringify(body)
        });

        if (response.status !== 200) {
            throw new Error(`API returned status ${response.status}`);
        }

        const data = response.json;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error("No text content returned from the model");
        }

        // Clean and isolate the JSON block to protect against conversational text or code blocks
        // Extract JSON — handle code fences, leading text, or raw objects
let cleanText = text.trim();

// Strip ```json ... ``` or ``` ... ``` fences
const fenceMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
if (fenceMatch) {
    cleanText = fenceMatch[1].trim();
} else {
    // Grab the first complete {...} block, ignoring any leading prose/bullets
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
        cleanText = cleanText.substring(startIdx, endIdx + 1).trim();
    }
}

if (!cleanText.startsWith('{')) {
    throw new Error(`Model returned non-JSON content: ${cleanText.slice(0, 100)}`);
}

const parsed = JSON.parse(cleanText);
        return {
            rewardXp: typeof parsed.rewardXp === 'number' ? Math.round(parsed.rewardXp) : 10,
            rewardGold: typeof parsed.rewardGold === 'number' ? Math.round(parsed.rewardGold) : 0,
            rewardSilver: typeof parsed.rewardSilver === 'number' ? Math.round(parsed.rewardSilver) : 0
        };
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

        let xpInput: any;
        let goldInput: any;
        let silverInput: any;

        // Gemma evaluation assistant setting row
        new Setting(contentEl)
            .setName('AI Reward Assistant')
            .setDesc('Evaluate quest rewards with gemma-4-31b-it based on task name and details.')
            .addButton(btn => {
                btn.setButtonText('Ask Gemma 🤖')
                   .setCta();
                
                if (!this.plugin.settings.geminiApiKey) {
                    btn.setDisabled(true);
                    btn.setTooltip('Go to Settings → Lv999 Plugin Settings to enter your Gemini API Key!');
                } else {
                    btn.setTooltip('Click to automatically set balanced XP, Gold, and Silver rewards!');
                }

                btn.onClick(async () => {
                    const questName = this.taskData.name?.trim();
                    if (!questName) {
                        new Notice('Please enter a task name first!');
                        return;
                    }

                    btn.setDisabled(true);
                    btn.setButtonText('Evaluating... ⏳');

                    try {
                        const rewards = await this.evaluateRewardsWithGemma(
                            this.plugin.settings.geminiApiKey,
                            questName,
                            this.taskData.type || 'general',
                            this.taskData.repetition || 'none'
                        );

                        if (rewards) {
                            this.taskData.rewardXp = rewards.rewardXp;
                            this.taskData.rewardGold = rewards.rewardGold;
                            this.taskData.rewardSilver = rewards.rewardSilver;

                            // Update inputs in the modal UI
                            xpInput?.setValue(String(rewards.rewardXp));
                            goldInput?.setValue(String(rewards.rewardGold));
                            silverInput?.setValue(String(rewards.rewardSilver));

                            new Notice('Gemma evaluated rewards successfully!');
                        }
                    } catch (e) {
                        console.error('Gemma API Error:', e);
                        new Notice('Failed to evaluate rewards. Check console/API key.');
                    } finally {
                        btn.setDisabled(false);
                        btn.setButtonText('Ask Gemma 🤖');
                    }
                });
            });

        new Setting(contentEl).setName('XP').addText(t => {
            xpInput = t;
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardXp ?? 10));
            t.onChange(v => (this.taskData.rewardXp = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Diamonds 💎').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardDiamond ?? 0));
            t.onChange(v => (this.taskData.rewardDiamond = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Gold ⭐️').addText(t => {
            goldInput = t;
            t.inputEl.type = 'number';
            t.setValue(String(this.taskData.rewardGold ?? 0));
            t.onChange(v => (this.taskData.rewardGold = parseFloat(v) || 0));
        });
        new Setting(contentEl).setName('Silver 🪙').addText(t => {
            silverInput = t;
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