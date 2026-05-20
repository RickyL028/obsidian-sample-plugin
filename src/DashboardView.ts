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

    getViewType(): string { return VIEW_TYPE_DASHBOARD; }
    getDisplayText(): string { return 'Lv999 Dashboard'; }
    getIcon(): IconName { return 'swords'; }

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

        // ── Header ──────────────────────────────────────────────────
        const header = container.createDiv('lv999-header-panel');
        const reqXp = 8 + (0.037 * this.plugin.settings.level);
        const xpPercent = Math.min(100, (this.plugin.settings.currentXp / reqXp) * 100);

        // Compute today string here too for the header stat pill.
        const nowH = new Date();
        const todayStrH = `${nowH.getFullYear()}-${String(nowH.getMonth() + 1).padStart(2, '0')}-${String(nowH.getDate()).padStart(2, '0')}`;
        const dueTodayCount = activeTasks.filter(
            t => t.type === 'daily' || t.dueDate === todayStrH
        ).length;

        header.innerHTML = `
            <div class="lv999-profile">
                <div class="lv999-avatar">🛡️</div>
                <div class="lv999-level-info">
                    <div class="lv999-level-label">LEVEL ${this.plugin.settings.level}</div>
                    <div class="lv999-xp-bar-container">
                        <div class="lv999-xp-bar" style="width: ${xpPercent}%"></div>
                        <div class="lv999-xp-bar-glow" style="width: ${xpPercent}%"></div>
                    </div>
                    <div class="lv999-xp-text">${this.plugin.settings.currentXp.toFixed(1)} <span class="lv999-xp-sep">/</span> ${reqXp.toFixed(1)} XP</div>
                </div>
            </div>
            <div class="lv999-header-center">
                <div class="lv999-stat-pills">
                    <div class="lv999-stat-pill active-count">
                        <span class="pill-val">${activeTasks.length}</span>
                        <span class="pill-lbl">Active</span>
                    </div>
                    <div class="lv999-stat-pill daily-count">
                        <span class="pill-val">${dueTodayCount}</span>
                        <span class="pill-lbl">Due today</span>
                    </div>
                </div>
            </div>
            <div class="lv999-header-right">
                <div class="lv999-currencies">
                    <div class="lv999-badge diamond" title="Diamonds">💎 <span>${this.plugin.settings.diamonds}</span></div>
                    <div class="lv999-badge gold" title="Gold Coins">🪙 <span>${this.plugin.settings.goldCoins}</span></div>
                    <div class="lv999-badge silver" title="Silver Coins">🥈 <span>${this.plugin.settings.silverCoins}</span></div>
                </div>
                <button id="lv999-add-task-btn" class="lv999-action-btn">+ New Quest</button>
            </div>
        `;

        header.querySelector('#lv999-add-task-btn')?.addEventListener('click', () => {
            new TaskModal(this.app, null, 'general', async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });

        // ── Grid ─────────────────────────────────────────────────────
        const grid = container.createDiv('lv999-grid');

        // Today's date string (local time) used to surface "due today" tasks.
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Daily panel shows: tasks typed 'daily' + any other task due today.
        // Tasks due today still appear in their own panel too (intentional).
        const dailyPanelTasks = activeTasks.filter(
            t => t.type === 'daily' || (t.dueDate === todayStr && t.type !== 'daily')
        );

        // Left col: General (Inbox) → Weekly
        const leftCol = grid.createDiv('lv999-col lv999-col-left');
        this.renderTaskPanel(leftCol, '📥 Inbox', activeTasks.filter(t => t.type === 'general' || !t.type), 'panel-general', 'general');
        this.renderTaskPanel(leftCol, '📅 Weekly', activeTasks.filter(t => t.type === 'weekly'), 'panel-weekly', 'weekly');

        // Center col: Daily Quests — dominant
        const centerCol = grid.createDiv('lv999-col lv999-col-center');
        this.renderDailyPanel(centerCol, dailyPanelTasks);

        // Right col: Strategic Goals → Forbidden Actions
        const rightCol = grid.createDiv('lv999-col lv999-col-right');
        this.renderTaskPanel(rightCol, '🎯 Goals', activeTasks.filter(t => t.type === 'strategic'), 'panel-strategic', 'strategic');
        this.renderTaskPanel(rightCol, '🔥 Forbidden', activeTasks.filter(t => t.type === 'negative'), 'panel-negative', 'negative');
    }

    // Special full-height daily panel for center
    renderDailyPanel(parent: HTMLElement, tasks: TaskData[]) {
        const panel = parent.createDiv('lv999-panel panel-daily lv999-daily-panel');

        const header = panel.createDiv('lv999-panel-header');
        const titleWrap = header.createDiv('lv999-panel-title');
        titleWrap.createEl('span', { cls: 'lv999-panel-icon', text: '☀️' });
        titleWrap.createEl('h3', { text: 'Daily Quests' });
        header.createSpan({ cls: 'lv999-task-count', text: `${tasks.length}` });

        const list = panel.createDiv('lv999-task-list');

        tasks.forEach(task => {
            const item = list.createDiv('lv999-task-item lv999-daily-item');

            const checkboxWrapper = item.createDiv('lv999-checkbox-wrapper');
            const checkbox = checkboxWrapper.createEl('input', { type: 'checkbox', cls: 'lv999-checkbox' });
            checkbox.addEventListener('change', async () => {
                item.addClass('lv999-completing');
                setTimeout(() => this.gainRewards(task), 400);
            });

            const textBlock = item.createDiv('lv999-task-text');
            textBlock.createDiv('lv999-task-name').setText(task.name);
            const dateStr = task.dueDate ? `📅 ${task.dueDate}  ·  ` : '';
            const detailStr = !task.rewardDiamond
                ? `${dateStr}${task.rewardXp} XP  ·  ${task.rewardGold}G  ${task.rewardSilver}S`
                : `${dateStr}${task.rewardXp} XP  ·  ${task.rewardDiamond} 💎`;
            textBlock.createDiv('lv999-task-details').setText(detailStr);

            const actions = item.createDiv('lv999-task-actions');
            const editBtn = actions.createEl('button', { cls: 'lv999-icon-btn', text: '✎' });
            editBtn.addEventListener('click', () => {
                new TaskModal(this.app, task, 'daily', async (data) => {
                    await this.taskManager.updateTask(task.file, data);
                }).open();
            });
            const delBtn = actions.createEl('button', { cls: 'lv999-icon-btn delete', text: '✕' });
            delBtn.addEventListener('click', async () => {
                item.addClass('lv999-completing');
                setTimeout(async () => { await this.taskManager.deleteTask(task.file); }, 400);
            });
        });

        if (tasks.length === 0) {
            list.createDiv('lv999-empty-state').setText('No daily quests. Enjoy the peace — or add one below.');
        }

        const quickAddRow = list.createDiv('lv999-quick-add lv999-daily-quick');
        quickAddRow.innerHTML = `<span class="lv999-plus-icon">+</span><span>Add Daily Quest</span>`;
        quickAddRow.addEventListener('click', () => {
            new TaskModal(this.app, null, 'daily', async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });
    }

    renderTaskPanel(parent: HTMLElement, title: string, tasks: TaskData[], customClass: string, categoryType: string) {
        const panel = parent.createDiv(`lv999-panel ${customClass}`);

        const header = panel.createDiv('lv999-panel-header');
        const titleWrap = header.createDiv('lv999-panel-title');
        titleWrap.createEl('h3', { text: title });
        header.createSpan({ cls: 'lv999-task-count', text: `${tasks.length}` });

        const list = panel.createDiv('lv999-task-list');

        tasks.forEach(task => {
            const item = list.createDiv('lv999-task-item');

            const checkboxWrapper = item.createDiv('lv999-checkbox-wrapper');
            const checkbox = checkboxWrapper.createEl('input', { type: 'checkbox', cls: 'lv999-checkbox' });
            checkbox.addEventListener('change', async () => {
                item.addClass('lv999-completing');
                setTimeout(() => this.gainRewards(task), 400);
            });

            const textBlock = item.createDiv('lv999-task-text');
            textBlock.createDiv('lv999-task-name').setText(task.name);
            const dateStr = task.dueDate ? `📅 ${task.dueDate}  ·  ` : '';
            const detailStr = !task.rewardDiamond
                ? `${dateStr}${task.rewardXp} XP  ·  ${task.rewardGold}G  ${task.rewardSilver}S`
                : `${dateStr}${task.rewardXp} XP  ·  ${task.rewardDiamond} 💎`;
            textBlock.createDiv('lv999-task-details').setText(detailStr);

            const actions = item.createDiv('lv999-task-actions');
            const editBtn = actions.createEl('button', { cls: 'lv999-icon-btn', text: '✎' });
            editBtn.addEventListener('click', () => {
                new TaskModal(this.app, task, categoryType, async (data) => {
                    await this.taskManager.updateTask(task.file, data);
                }).open();
            });
            const delBtn = actions.createEl('button', { cls: 'lv999-icon-btn delete', text: '✕' });
            delBtn.addEventListener('click', async () => {
                item.addClass('lv999-completing');
                setTimeout(async () => { await this.taskManager.deleteTask(task.file); }, 400);
            });
        });

        const quickAddRow = list.createDiv('lv999-quick-add');
        quickAddRow.innerHTML = `<span class="lv999-plus-icon">+</span><span>Add quest</span>`;
        quickAddRow.addEventListener('click', () => {
            new TaskModal(this.app, null, categoryType, async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });
    }
}