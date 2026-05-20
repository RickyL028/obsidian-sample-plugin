import { App, TFile, normalizePath } from 'obsidian';
import { TaskData } from './types';

export class TaskManager {
    app: App;
    folderPath: string;

    constructor(app: App, folderPath: string) {
        this.app = app;
        this.folderPath = folderPath;
    }

    async ensureFolder() {
        const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folderPath));
        if (!folder) {
            await this.app.vault.createFolder(normalizePath(this.folderPath));
        }
    }

    async getTasks(): Promise<TaskData[]> {
        const files = this.app.vault.getMarkdownFiles();
        const tasks: TaskData[] = [];

        for (const file of files) {
            if (file.path.startsWith(this.folderPath + '/')) {
                const cache = this.app.metadataCache.getFileCache(file);
                const fm = cache?.frontmatter;
                if (fm && fm.isLv999Task) {
                    tasks.push({
                        id: file.basename,
                        name: fm.taskName || file.basename,
                        type: fm.type || 'daily',
                        dueDate: fm.dueDate || '',
                        repetition: fm.repetition || 'none',
                        rewardXp: fm.rewardXp || 0,
                        rewardDiamond: fm.rewardDiamond || 0,
                        rewardGold: fm.rewardGold || 0,
                        rewardSilver: fm.rewardSilver || 0,
                        completed: fm.completed || false,
                        file: file
                    });
                }
            }
        }
        return tasks;
    }

    async createTask(data: Partial<TaskData>) {
        await this.ensureFolder();
        const filename = `Task_${Date.now()}.md`;
        const path = normalizePath(`${this.folderPath}/${filename}`);
        
        const content = `---
isLv999Task: true
taskName: "${data.name}"
type: ${data.type}
dueDate: "${data.dueDate}"
repetition: "${data.repetition}"
rewardXp: ${data.rewardXp}
rewardDiamond: ${data.rewardDiamond}
rewardGold: ${data.rewardGold}
rewardSilver: ${data.rewardSilver}
completed: false
---

# ${data.name}
`;
        await this.app.vault.create(path, content);
    }

    async updateTask(file: TFile, data: Partial<TaskData>) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm.taskName = data.name;
            fm.type = data.type;
            fm.dueDate = data.dueDate;
            fm.repetition = data.repetition;
            fm.rewardXp = data.rewardXp;
            fm.rewardDiamond = data.rewardDiamond;
            fm.rewardGold = data.rewardGold;
            fm.rewardSilver = data.rewardSilver;
        });
    }

    async completeTask(task: TaskData) {
        // Mark old as completed
        await this.app.fileManager.processFrontMatter(task.file, (fm) => {
            fm.completed = true;
        });

        // Handle repetition by spawning a new uncompleted task
        if (task.repetition !== 'none') {
            const nextDate = new Date(task.dueDate || new Date().toISOString().split('T')[0]);
            if (task.repetition === 'daily') {
                nextDate.setDate(nextDate.getDate() + 1);
            } else if (task.repetition.startsWith('weekly')) {
                nextDate.setDate(nextDate.getDate() + 7);
            }
            
            const nextDateStr = nextDate.toISOString().split('T')[0];
            await this.createTask({
                ...task,
                dueDate: nextDateStr,
                completed: false
            });
        }
    }

    async deleteTask(file: TFile) {
        await this.app.vault.trash(file, true);
    }
}