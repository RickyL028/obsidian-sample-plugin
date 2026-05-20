import { App, Modal, Setting } from 'obsidian';
import { TaskData } from './types';

export class TaskModal extends Modal {
    taskData: Partial<TaskData>;
    onSubmit: (result: Partial<TaskData>) => void;

    constructor(app: App, defaultData: Partial<TaskData> | null, onSubmit: (result: Partial<TaskData>) => void) {
        super(app);
        this.onSubmit = onSubmit;
        this.taskData = defaultData || {
            name: '',
            type: 'daily',
            dueDate: new Date().toISOString().split('T')[0],
            repetition: 'none',
            rewardXp: 10,
            rewardDiamond: 0,
            rewardGold: 0,
            rewardSilver: 0
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.taskData.name ? 'Edit Quest' : 'New Quest' });

        new Setting(contentEl).setName('Task Name').addText(t => t.setValue(this.taskData.name!).onChange(v => this.taskData.name = v));
        
        new Setting(contentEl).setName('Due Date (YYYY-MM-DD)').addText(t => t.setValue(this.taskData.dueDate!).onChange(v => this.taskData.dueDate = v));

        new Setting(contentEl).setName('Task Type').addDropdown(d => {
            d.addOption('daily', 'Daily');
            d.addOption('weekly', 'Weekly');
            d.addOption('strategic', 'Strategic Goals');
            d.addOption('negative', 'Negative (Do Not Do)');
            d.setValue(this.taskData.type!);
            d.onChange(v => this.taskData.type = v as any);
        });

        new Setting(contentEl).setName('Repetition').addDropdown(d => {
            d.addOption('none', 'None');
            d.addOption('daily', 'Every Day');
            d.addOption('weekly-mon', 'Every Week (Monday)');
            d.addOption('weekly-tue', 'Every Week (Tuesday)');
            d.addOption('weekly-wed', 'Every Week (Wednesday)');
            d.addOption('weekly-thu', 'Every Week (Thursday)');
            d.addOption('weekly-fri', 'Every Week (Friday)');
            d.addOption('weekly-sat', 'Every Week (Saturday)');
            d.addOption('weekly-sun', 'Every Week (Sunday)');
            d.setValue(this.taskData.repetition!);
            d.onChange(v => this.taskData.repetition = v);
        });

        contentEl.createEl('h3', { text: 'Rewards' });

        new Setting(contentEl).setName('XP Reward').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(this.taskData.rewardXp!.toString()).onChange(v => this.taskData.rewardXp = parseFloat(v));
        });
        new Setting(contentEl).setName('Diamond Reward').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(this.taskData.rewardDiamond!.toString()).onChange(v => this.taskData.rewardDiamond = parseFloat(v));
        });
        new Setting(contentEl).setName('Gold Reward').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(this.taskData.rewardGold!.toString()).onChange(v => this.taskData.rewardGold = parseFloat(v));
        });
        new Setting(contentEl).setName('Silver Reward').addText(t => {
            t.inputEl.type = 'number';
            t.setValue(this.taskData.rewardSilver!.toString()).onChange(v => this.taskData.rewardSilver = parseFloat(v));
        });

        new Setting(contentEl).addButton(btn => {
            btn.setButtonText('Save Quest').setCta().onClick(() => {
                this.close();
                this.onSubmit(this.taskData);
            });
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}