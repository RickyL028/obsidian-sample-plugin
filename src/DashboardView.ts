import { ItemView, WorkspaceLeaf, IconName, debounce, TAbstractFile } from 'obsidian';
import Lv999Plugin from './main';
import { TaskManager } from './TaskManager';
import { TaskData } from './types';
import { TaskModal } from './TaskModal';

export const VIEW_TYPE_DASHBOARD = 'lv999-dashboard';

export class DashboardView extends ItemView {
    plugin: Lv999Plugin;
    taskManager: TaskManager;

    requestRender = debounce(this.renderDashboard.bind(this), 200);

    constructor(leaf: WorkspaceLeaf, plugin: Lv999Plugin) {
        super(leaf);
        this.plugin = plugin;
        this.taskManager = new TaskManager(this.app, plugin.settings.taskFolder);
    }

    getViewType(): string {
        return VIEW_TYPE_DASHBOARD;
    }

    getDisplayText(): string {
        return 'Lv999 Dashboard';
    }

    getIcon(): IconName {
        return 'swords';
    }

    async onOpen() {
        this.registerEvent(this.app.metadataCache.on('changed', (file) => this.onTaskFileChanged(file)));
        this.registerEvent(this.app.vault.on('create', (file) => this.onTaskFileChanged(file)));
        this.registerEvent(this.app.vault.on('delete', (file) => this.onTaskFileChanged(file)));
        this.registerEvent(this.app.vault.on('rename', (file) => this.onTaskFileChanged(file)));

        this.renderDashboard();
    }

    onTaskFileChanged(file: TAbstractFile) {
        if (file && file.path.startsWith(this.plugin.settings.taskFolder + '/')) {
            this.requestRender();
        }
    }

    async gainRewards(task: TaskData) {
        let { settings } = this.plugin;
        settings.diamonds += task.rewardDiamond;
        settings.goldCoins += task.rewardGold;
        settings.silverCoins += task.rewardSilver;
        
        settings.currentXp += task.rewardXp;
        let requiredXp = 8 + (0.037 * settings.level);
        
        while (settings.currentXp >= requiredXp && settings.level < 999) {
            settings.currentXp -= requiredXp;
            settings.level++;
            requiredXp = 8 + (0.037 * settings.level);
        }
        
        await this.plugin.saveSettings();
        await this.taskManager.completeTask(task);
    }

    async renderDashboard() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('lv999-dashboard');

        const tasks = await this.taskManager.getTasks();
        const activeTasks = tasks.filter(t => !t.completed);

        const header = container.createDiv('lv999-header-panel');
        const reqXp = 8 + (0.037 * this.plugin.settings.level);
        const xpPercent = Math.min(100, (this.plugin.settings.currentXp / reqXp) * 100);
        
        header.innerHTML = `
            <div class="lv999-profile">
                <div class="lv999-avatar">🛡️</div>
                <div class="lv999-level-info">
                    <h2>Level ${this.plugin.settings.level} Character</h2>
                    <div class="lv999-xp-bar-container">
                        <div class="lv999-xp-bar" style="width: ${xpPercent}%"></div>
                    </div>
                    <div class="lv999-xp-text">XP: ${this.plugin.settings.currentXp.toFixed(1)} / ${reqXp.toFixed(1)}</div>
                </div>
            </div>
            <div class="lv999-currencies">
                <div class="lv999-badge diamond" title="Diamonds">💎 <span>${this.plugin.settings.diamonds}</span></div>
                <div class="lv999-badge gold" title="Gold Coins">🪙 <span>${this.plugin.settings.goldCoins}</span></div>
                <div class="lv999-badge silver" title="Silver Coins">🥈 <span>${this.plugin.settings.silverCoins}</span></div>
            </div>
            <button id="lv999-add-task-btn" class="lv999-action-btn">➕ Quick Add</button>
        `;

        header.querySelector('#lv999-add-task-btn')?.addEventListener('click', () => {
            new TaskModal(this.app, null, 'general', async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });

        const grid = container.createDiv('lv999-grid');

        // Left Col
        const leftCol = grid.createDiv('lv999-col');
        this.renderTaskPanel(leftCol, '🎯 Strategic Goals', activeTasks.filter(t => t.type === 'strategic'), 'panel-strategic', 'strategic');
        this.renderTaskPanel(leftCol, '📅 Weekly Tasks', activeTasks.filter(t => t.type === 'weekly'), 'panel-weekly', 'weekly');

        // Center Col (General and Daily)
        const centerCol = grid.createDiv('lv999-col center-col');
        this.renderTaskPanel(centerCol, '📥 General (Inbox)', activeTasks.filter(t => t.type === 'general' || !t.type), 'panel-general', 'general', true);
        this.renderTaskPanel(centerCol, '☀️ Daily Quests (Todoist)', activeTasks.filter(t => t.type === 'daily'), 'panel-daily', 'daily', true);

        // Right Col
        const rightCol = grid.createDiv('lv999-col');
        this.renderTaskPanel(rightCol, '🔥 Forbidden Actions', activeTasks.filter(t => t.type === 'negative'), 'panel-negative', 'negative');
    }

    renderTaskPanel(parent: HTMLElement, title: string, tasks: TaskData[], customClass: string, categoryType: string, isCenter: boolean = false) {
        const panel = parent.createDiv(`lv999-panel ${customClass}`);
        
        const header = panel.createDiv('lv999-panel-header');
        header.createEl('h3', { text: title });
        header.createSpan({ cls: 'lv999-task-count', text: `${tasks.length}` });

        const list = panel.createDiv('lv999-task-list');

        tasks.forEach(task => {
            const item = list.createDiv(`lv999-task-item ${isCenter ? 'todoist-card' : ''}`);

            const checkboxWrapper = item.createDiv('lv999-checkbox-wrapper');
            const checkbox = checkboxWrapper.createEl('input', { type: 'checkbox', cls: 'lv999-checkbox' });
            
            checkbox.addEventListener('change', async () => {
                item.addClass('lv999-completing');
                setTimeout(() => this.gainRewards(task), 400);
            });

            const textBlock = item.createDiv('lv999-task-text');
            textBlock.createDiv('lv999-task-name').setText(task.name);
            
            // Format details conditionally based on whether a due date exists
            const dateStr = task.dueDate ? `📅 ${task.dueDate} | ` : '';
            const detailStr = !task.rewardDiamond ? `${dateStr} ${task.rewardXp} XP | ${task.rewardGold} G ${task.rewardSilver} S` : `${dateStr} ${task.rewardXp} XP | ${task.rewardDiamond} 💎`;
            textBlock.createDiv('lv999-task-details').setText(detailStr);

            const actions = item.createDiv('lv999-task-actions');
            
            const editBtn = actions.createEl('button', { cls: 'lv999-icon-btn', text: '✎' });
            editBtn.addEventListener('click', () => {
                new TaskModal(this.app, task, categoryType, async (data) => {
                    await this.taskManager.updateTask(task.file, data);
                }).open();
            });

            const delBtn = actions.createEl('button', { cls: 'lv999-icon-btn delete', text: '🗑️' });
            delBtn.addEventListener('click', async () => {
                item.addClass('lv999-completing');
                setTimeout(async () => {
                    await this.taskManager.deleteTask(task.file);
                }, 400);
            });
        });

        // Interactive "Quick Add" row added to every box
        const quickAddRow = list.createDiv(`lv999-quick-add ${isCenter ? 'todoist-card' : ''}`);
        quickAddRow.innerHTML = `<span>➕ Add Quest...</span>`;
        quickAddRow.addEventListener('click', () => {
            new TaskModal(this.app, null, categoryType, async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });
    }
}