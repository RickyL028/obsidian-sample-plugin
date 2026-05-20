import { App, normalizePath, TFile } from 'obsidian';

export interface DailyLogData {
    dateStr: string; // YYYY-MM-DD
    studySeconds: number;
    xpEarned: number;
    diamondsEarned: number;
    goldEarned: number;
    silverEarned: number;
}

export class DailyLogger {
    app: App;
    folderPath: string = 'Lv999_Logs';

    constructor(app: App) {
        this.app = app;
    }

    async ensureFolder() {
        const path = normalizePath(this.folderPath);
        if (!this.app.vault.getAbstractFileByPath(path)) {
            await this.app.vault.createFolder(path);
        }
    }

    getLogFilePath(dateStr: string): string {
        return normalizePath(`${this.folderPath}/${dateStr}.md`);
    }

    /** Formats a Date as YYYY-MM-DD in local time */
    static getTodayStr(): string {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /** Helper to parse YAML frontmatter from a markdown string */
    parseLogContent(content: string, dateStr: string): DailyLogData {
        const defaults: DailyLogData = {
            dateStr,
            studySeconds: 0,
            xpEarned: 0,
            diamondsEarned: 0,
            goldEarned: 0,
            silverEarned: 0
        };

        const fmRegex = /^---\s*\n([\s\S]*?)\n---/;
        const match = content.match(fmRegex);
        if (!match) return defaults;

        const fmText = match[1];
        if (!fmText) return defaults;
        
        const lines = fmText.split('\n');
        
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const part0 = parts[0];
                if (part0) {
                    const key = part0.trim();
                    const val = parseFloat(parts.slice(1).join(':').trim()) || 0;
                    
                    if (key === 'studySeconds') defaults.studySeconds = val;
                    else if (key === 'xpEarned') defaults.xpEarned = val;
                    else if (key === 'diamondsEarned') defaults.diamondsEarned = val;
                    else if (key === 'goldEarned') defaults.goldEarned = val;
                    else if (key === 'silverEarned') defaults.silverEarned = val;
                }
            }
        });

        return defaults;
    }

    /** Generates frontmatter and body for a daily log file */
    generateLogContent(data: DailyLogData): string {
        const studyMins = Math.floor(data.studySeconds / 60);
        const studyRemainingSecs = data.studySeconds % 60;
        
        return `---
isLv999Log: true
studySeconds: ${data.studySeconds}
xpEarned: ${data.xpEarned}
diamondsEarned: ${data.diamondsEarned}
goldEarned: ${data.goldEarned}
silverEarned: ${data.silverEarned}
---

# Daily Log: ${data.dateStr}

- **Study Time**: ${studyMins}m ${studyRemainingSecs}s (${(data.studySeconds / 3600).toFixed(2)} hours)
- **XP Earned**: ${data.xpEarned.toFixed(1)} XP
- **Diamonds Gained**: ${data.diamondsEarned} 💎
- **Gold Gained**: ${data.goldEarned} ⭐️
- **Silver Gained**: ${data.silverEarned} 🪙
`;
    }

    /** Reads the log data for a specific date (local time) */
    async getLog(dateStr: string): Promise<DailyLogData> {
        await this.ensureFolder();
        const filePath = this.getLogFilePath(dateStr);
        const abstractFile = this.app.vault.getAbstractFileByPath(filePath);

        if (abstractFile instanceof TFile) {
            const content = await this.app.vault.read(abstractFile);
            return this.parseLogContent(content, dateStr);
        }

        return {
            dateStr,
            studySeconds: 0,
            xpEarned: 0,
            diamondsEarned: 0,
            goldEarned: 0,
            silverEarned: 0
        };
    }

    /** Updates the log data for a specific date (local time) */
    async updateLog(dateStr: string, updates: Partial<Omit<DailyLogData, 'dateStr'>>) {
        await this.ensureFolder();
        const current = await this.getLog(dateStr);
        
        const updated: DailyLogData = {
            dateStr,
            studySeconds: Math.max(0, (updates.studySeconds !== undefined ? updates.studySeconds : current.studySeconds)),
            xpEarned: Math.max(0, (updates.xpEarned !== undefined ? updates.xpEarned : current.xpEarned)),
            diamondsEarned: Math.max(0, (updates.diamondsEarned !== undefined ? updates.diamondsEarned : current.diamondsEarned)),
            goldEarned: Math.max(0, (updates.goldEarned !== undefined ? updates.goldEarned : current.goldEarned)),
            silverEarned: Math.max(0, (updates.silverEarned !== undefined ? updates.silverEarned : current.silverEarned))
        };

        const filePath = this.getLogFilePath(dateStr);
        const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
        const content = this.generateLogContent(updated);

        if (abstractFile instanceof TFile) {
            await this.app.vault.modify(abstractFile, content);
        } else {
            await this.app.vault.create(filePath, content);
        }
    }

    /** Gets all logs in the folder, sorted by date (ascending) */
    async getAllLogs(): Promise<DailyLogData[]> {
        await this.ensureFolder();
        const logs: DailyLogData[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (file.path.startsWith(this.folderPath + '/') && file.name.endsWith('.md')) {
                const dateStr = file.basename; // e.g. YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const content = await this.app.vault.read(file);
                    logs.push(this.parseLogContent(content, dateStr));
                }
            }
        }

        // Sort by date YYYY-MM-DD string
        return logs.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }
}
