import { ItemView, WorkspaceLeaf, IconName, debounce, TAbstractFile, Notice } from 'obsidian';
import Lv999Plugin from './main';
import { TaskManager } from './TaskManager';
import { TaskData } from './types';
import { TaskModal } from './TaskModal';
import { DailyLogger, DailyLogData } from './DailyLogger';

export const VIEW_TYPE_DASHBOARD = 'lv999-dashboard';


export class DashboardView extends ItemView {
    plugin: Lv999Plugin;
    taskManager: TaskManager;

    activeTab: 'quests' | 'analytics' = 'quests';
    selectedMetric: 'study' | 'xp' | 'diamonds' | 'coins' = 'study';
    selectedRange: 'weekly' | 'monthly' | 'alltime' = 'weekly';

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

        this.plugin.onTimerTick = (sessionSecs, todaySecs) => {
            this.updateTimerDisplay(sessionSecs, todaySecs);
        };
        this.plugin.onTimerStateChange = () => {
            this.updateTimerStateUI();
        };

        this.renderDashboard();
    }

    async onClose() {
        this.plugin.onTimerTick = undefined;
        this.plugin.onTimerStateChange = undefined;
    }

    onTaskFileChanged(file: TAbstractFile) {
        if (file && file.path.startsWith(this.plugin.settings.taskFolder + '/')) {
            this.requestRender();
        }
    }

    async gainRewards(task: TaskData) {
        let { settings } = this.plugin;
        
        // 1. Add rewards to currency settings first, so new diamonds count toward the XP boost
        settings.diamonds += task.rewardDiamond;
        settings.goldCoins += task.rewardGold;
        settings.silverCoins += task.rewardSilver;
        
        // 2. Calculate boosted XP (+10% for every diamond currently held)
        const xpMultiplier = 1 + (settings.diamonds * 0.10);
        const boostedXp = task.rewardXp * xpMultiplier;

        settings.currentXp += boostedXp;
        let requiredXp = 8 + (0.037 * settings.level);
        while (settings.currentXp >= requiredXp && settings.level < 999) {
            settings.currentXp -= requiredXp;
            settings.level++;
            requiredXp = 8 + (0.037 * settings.level);
        }
        await this.plugin.saveSettings();
        await this.taskManager.completeTask(task);

        const todayStr = DailyLogger.getTodayStr();
        const currentLog = await this.plugin.dailyLogger.getLog(todayStr);
        await this.plugin.dailyLogger.updateLog(todayStr, {
            xpEarned: currentLog.xpEarned + boostedXp,
            diamondsEarned: currentLog.diamondsEarned + task.rewardDiamond,
            goldEarned: currentLog.goldEarned + task.rewardGold,
            silverEarned: currentLog.silverEarned + task.rewardSilver
        });

        new Notice(`Quest Complete! Gained ${boostedXp.toFixed(1)} XP! (x${xpMultiplier.toFixed(1)} Diamond Boost)`);
        this.requestRender();
    }

    updateTimerDisplay(sessionSecs: number, todaySecs: number) {
        const sessionTimeEl = this.contentEl.querySelector('#lv999-timer-session-time');
        if (sessionTimeEl) {
            const h = Math.floor(sessionSecs / 3600);
            const m = Math.floor((sessionSecs % 3600) / 60);
            const s = sessionSecs % 60;
            sessionTimeEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        const todayAccumEl = this.contentEl.querySelector('#lv999-timer-today-accum');
        if (todayAccumEl) {
            const todayMins = Math.floor(todaySecs / 60);
            todayAccumEl.textContent = `Today: ${todayMins}m`;
        }

        const yieldProgressEl = this.contentEl.querySelector('#lv999-timer-yield-progress') as HTMLElement;
        if (yieldProgressEl) {
            const percent = ((todaySecs % 300) / 300) * 100;
            yieldProgressEl.style.width = `${percent}%`;
        }
    }

    updateTimerStateUI() {
        const toggleBtn = this.contentEl.querySelector('#lv999-timer-toggle-btn');
        if (toggleBtn) {
            if (this.plugin.isStudyTimerRunning) {
                toggleBtn.textContent = '⏸';
                toggleBtn.addClass('running');
                toggleBtn.setAttribute('title', 'Pause Study Timer');
            } else {
                toggleBtn.textContent = '▶';
                toggleBtn.removeClass('running');
                toggleBtn.setAttribute('title', 'Start Study Timer');
            }
        }
    }
    

    async renderDashboard() {
        const container = this.contentEl;
        container.empty();
        container.addClass('lv999-dashboard');

        const tasks = await this.taskManager.getTasks();
        const activeTasks = tasks.filter(t => !t.completed);

        const header = container.createDiv('lv999-header-panel');
        const reqXp = 8 + (0.037 * this.plugin.settings.level);
        const xpPercent = Math.min(100, (this.plugin.settings.currentXp / reqXp) * 100);

        const nowH = new Date();
        const todayStrH = `${nowH.getFullYear()}-${String(nowH.getMonth() + 1).padStart(2, '0')}-${String(nowH.getDate()).padStart(2, '0')}`;
        const dueTodayCount = activeTasks.filter(
            t => t.type === 'daily' || t.dueDate === todayStrH
        ).length;

        header.innerHTML = `
            <div class="lv999-profile">
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
                <div class="lv999-study-timer-hud">
                    <button class="timer-play-btn" id="lv999-timer-toggle-btn" title="Start Study Timer">▶</button>
                    <div class="timer-display-group">
                        <span class="timer-time" id="lv999-timer-session-time">00:00:00</span>
                        <span class="timer-label" id="lv999-timer-today-accum">Today: 0m</span>
                    </div>
                    <div class="timer-yield-progress-container" title="Progress towards next 1 XP (gained every 5 minutes)">
                        <div class="timer-yield-progress" id="lv999-timer-yield-progress" style="width: 0%"></div>
                    </div>
                </div>
            </div>
            <div class="lv999-header-right">
                <div class="lv999-stat-pills">
                    <div class="lv999-stat-pill active-count" title="Active quests">
                        <span class="pill-val">${activeTasks.length}</span>
                        <span class="pill-lbl">Active</span>
                    </div>
                    <div class="lv999-stat-pill daily-count" title="Due today">
                        <span class="pill-val">${dueTodayCount}</span>
                        <span class="pill-lbl">Due</span>
                    </div>
                </div>
                <div class="lv999-currencies">
                    <div class="lv999-badge diamond" title="Diamonds">💎 <span>${this.plugin.settings.diamonds}</span></div>
                    <div class="lv999-badge gold" title="Gold Coins">⭐️ <span>${this.plugin.settings.goldCoins}</span></div>
                    <div class="lv999-badge silver" title="Silver Coins">🪙 <span>${this.plugin.settings.silverCoins}</span></div>
                </div>
                <button id="lv999-add-task-btn" class="lv999-action-btn">+ New Quest</button>
            </div>
        `;

        header.querySelector('#lv999-timer-toggle-btn')?.addEventListener('click', () => {
            this.plugin.toggleStudyTimer();
        });

        this.updateTimerDisplay(this.plugin.studySessionSeconds, this.plugin.settings.todayStudySeconds);
        this.updateTimerStateUI();

        header.querySelector('#lv999-add-task-btn')?.addEventListener('click', () => {
            new TaskModal(this.app, this.plugin, null, 'general', async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });

        const tabNav = container.createDiv('lv999-sub-tabs-container');
        tabNav.innerHTML = `
            <div class="lv999-sub-tabs">
                <button class="lv999-tab-btn ${this.activeTab === 'quests' ? 'active' : ''}" id="lv999-tab-quests">⚔️ Active Quests</button>
                <button class="lv999-tab-btn ${this.activeTab === 'analytics' ? 'active' : ''}" id="lv999-tab-analytics">📊 History & Analytics</button>
            </div>
        `;

        tabNav.querySelector('#lv999-tab-quests')?.addEventListener('click', () => {
            this.activeTab = 'quests';
            this.renderDashboard();
        });

        tabNav.querySelector('#lv999-tab-analytics')?.addEventListener('click', () => {
            this.activeTab = 'analytics';
            this.renderDashboard();
        });

        const contentArea = container.createDiv('lv999-tab-content');

        if (this.activeTab === 'quests') {
            await this.renderQuestsGrid(contentArea, activeTasks);
        } else {
            await this.renderAnalyticsDashboard(contentArea);
        }
    }

    async renderQuestsGrid(parent: HTMLElement, activeTasks: TaskData[]) {
        const grid = parent.createDiv('lv999-grid');

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const dailyPanelTasks = activeTasks.filter(
            t => (t.type as string) === 'daily' || (t.dueDate === todayStr && (t.type as string) !== 'daily')
        );

        const leftCol = grid.createDiv('lv999-col lv999-col-left');
        this.renderTaskPanel(leftCol, 'Inbox', activeTasks.filter(t => t.type === 'general' || !t.type), 'panel-general', 'general');
        this.renderTaskPanel(leftCol, 'Weekly', activeTasks.filter(t => t.type === 'weekly'), 'panel-weekly', 'weekly');

        const centerCol = grid.createDiv('lv999-col lv999-col-center');
        this.renderDailyPanel(centerCol, dailyPanelTasks);

        const rightCol = grid.createDiv('lv999-col lv999-col-right');
        this.renderTaskPanel(rightCol, 'Goals', activeTasks.filter(t => t.type === 'strategic'), 'panel-strategic', 'strategic');
        this.renderTaskPanel(rightCol, 'Negative', activeTasks.filter(t => t.type === 'negative'), 'panel-negative', 'negative');
    }

    renderDailyPanel(parent: HTMLElement, tasks: TaskData[]) {
        const panel = parent.createDiv('lv999-panel panel-daily lv999-daily-panel');

        const header = panel.createDiv('lv999-panel-header');
        const titleWrap = header.createDiv('lv999-panel-title');
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
                new TaskModal(this.app, this.plugin, task, 'daily', async (data) => {
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
            list.createDiv('lv999-empty-state').setText('No daily quests.');
        }

        const quickAddRow = list.createDiv('lv999-quick-add lv999-daily-quick');
        quickAddRow.innerHTML = `<span class="lv999-plus-icon">+</span><span>Add Daily Quest</span>`;
        quickAddRow.addEventListener('click', () => {
            new TaskModal(this.app, this.plugin, null, 'daily', async (data) => {
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
                new TaskModal(this.app, this.plugin, task, categoryType, async (data) => {
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
            new TaskModal(this.app, this.plugin, null, categoryType, async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });
    }

    // ── Analytics Helpers ──────────────────────────────────────────

    /**
     * Build a padded array of DailyLogData for the last N calendar days.
     * Days with no log entry are filled with zeroed records.
     */
    private buildPaddedDays(allLogs: DailyLogData[], days: number): DailyLogData[] {
        const result: DailyLogData[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const existing = allLogs.find(l => l.dateStr === dateStr);
            result.push(existing ?? {
                dateStr,
                studySeconds: 0,
                xpEarned: 0,
                diamondsEarned: 0,
                goldEarned: 0,
                silverEarned: 0
            });
        }
        return result;
    }

    /**
     * For all-time view, aggregate individual day logs into weekly buckets.
     * Each bucket's dateStr is set to the Monday of that week (ISO label).
     */
    private aggregateIntoWeeks(allLogs: DailyLogData[]): DailyLogData[] {
        if (allLogs.length === 0) return [];

        // Sort ascending
        const sorted = [...allLogs].sort((a, b) => a.dateStr.localeCompare(b.dateStr));

        const buckets = new Map<string, DailyLogData>();

        sorted.forEach(log => {
            const parts = log.dateStr.split('-').map(Number);
            const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
            // Monday of this week
            const day = d.getDay(); // 0=Sun
            const diff = (day === 0) ? -6 : 1 - day;
            const monday = new Date(d);
            monday.setDate(d.getDate() + diff);
            const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

            const existing = buckets.get(key);
            if (existing) {
                existing.studySeconds += log.studySeconds;
                existing.xpEarned += log.xpEarned;
                existing.diamondsEarned += log.diamondsEarned;
                existing.goldEarned += log.goldEarned;
                existing.silverEarned += log.silverEarned;
            } else {
                buckets.set(key, {
                    dateStr: key,
                    studySeconds: log.studySeconds,
                    xpEarned: log.xpEarned,
                    diamondsEarned: log.diamondsEarned,
                    goldEarned: log.goldEarned,
                    silverEarned: log.silverEarned
                });
            }
        });

        return Array.from(buckets.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    }

    /**
     * Returns the dataset and a label/period description for the current selectedRange.
     * For all-time the data is week-aggregated; for weekly/monthly it's individual days.
     */
    private async getDataForRange(allLogs: DailyLogData[]): Promise<{
        data: DailyLogData[];
        periodLabel: string;
        pointCount: number;
        isWeeklyBuckets: boolean;
    }> {
        switch (this.selectedRange) {
            case 'weekly':
                return {
                    data: this.buildPaddedDays(allLogs, 7),
                    periodLabel: 'last 7 days',
                    pointCount: 7,
                    isWeeklyBuckets: false
                };
            case 'monthly':
                return {
                    data: this.buildPaddedDays(allLogs, 30),
                    periodLabel: 'last 30 days',
                    pointCount: 30,
                    isWeeklyBuckets: false
                };
            case 'alltime': {
                // Use every real log we have, aggregated by week
                const weekBuckets = this.aggregateIntoWeeks(allLogs);
                // Guarantee at least one bucket so the graph is never empty
                if (weekBuckets.length === 0) {
                    const todayStr = DailyLogger.getTodayStr();
                    weekBuckets.push({ dateStr: todayStr, studySeconds: 0, xpEarned: 0, diamondsEarned: 0, goldEarned: 0, silverEarned: 0 });
                }
                return {
                    data: weekBuckets,
                    periodLabel: `all time (${weekBuckets.length} weeks)`,
                    pointCount: weekBuckets.length,
                    isWeeklyBuckets: true
                };
            }
        }
    }

    // ── Render Analytics & Graphs Tab ──────────────────────────────
    async renderAnalyticsDashboard(parent: HTMLElement) {
        const wrapper = parent.createDiv('lv999-analytics-container');

        const allLogs = await this.plugin.dailyLogger.getAllLogs();
        const rangeInfo = await this.getDataForRange(allLogs);
        const { data, periodLabel, isWeeklyBuckets } = rangeInfo;

        wrapper.innerHTML = `
            <div class="analytics-header">
                <div class="analytics-title-wrap">
                    <h3>Analytics & History</h3>
                    <p class="analytics-subtitle">Showing ${periodLabel}${isWeeklyBuckets ? ' · weekly buckets' : ''}.</p>
                </div>

                <!-- Row 1: Metric toggles -->
                <div class="metric-toggles">
                    <button class="metric-btn ${this.selectedMetric === 'study' ? 'active' : ''}" data-metric="study">📚 Study Time</button>
                    <button class="metric-btn ${this.selectedMetric === 'xp' ? 'active' : ''}" data-metric="xp">⚔️ XP Gained</button>
                    <button class="metric-btn ${this.selectedMetric === 'diamonds' ? 'active' : ''}" data-metric="diamonds">💎 Diamonds</button>
                    <button class="metric-btn ${this.selectedMetric === 'coins' ? 'active' : ''}" data-metric="coins">🪙 Coins</button>
                </div>

                <!-- Row 2: Range toggles -->
                <div class="range-toggles">
                    <button class="range-btn ${this.selectedRange === 'weekly' ? 'active' : ''}" data-range="weekly">7 Days</button>
                    <button class="range-btn ${this.selectedRange === 'monthly' ? 'active' : ''}" data-range="monthly">30 Days</button>
                    <button class="range-btn ${this.selectedRange === 'alltime' ? 'active' : ''}" data-range="alltime">All Time</button>
                </div>
            </div>

            <div class="graph-card">
                <div class="graph-wrapper" id="lv999-svg-graph-container">
                    <!-- SVG chart inserted here -->
                </div>
            </div>

            <div class="analytics-cards-grid" id="lv999-analytics-summary-cards">
                <!-- Summary cards generated here -->
            </div>
        `;

        // Bind metric toggles
        wrapper.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const metric = (e.target as HTMLElement).getAttribute('data-metric') as any;
                this.selectedMetric = metric;
                wrapper.querySelectorAll('.metric-btn').forEach(b => b.removeClass('active'));
                (e.target as HTMLElement).addClass('active');
                // Re-fetch range data in case it matters, then re-render sub-components
                const fresh = await this.getDataForRange(allLogs);
                this.renderSVGGraph(wrapper.querySelector('#lv999-svg-graph-container') as HTMLElement, fresh.data, metric, fresh.isWeeklyBuckets);
                this.renderSummaryCards(wrapper.querySelector('#lv999-analytics-summary-cards') as HTMLElement, fresh.data, metric, fresh.periodLabel, fresh.isWeeklyBuckets);
            });
        });

        // Bind range toggles — re-fetch & re-render everything
        wrapper.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const range = (e.target as HTMLElement).getAttribute('data-range') as any;
                this.selectedRange = range;
                wrapper.querySelectorAll('.range-btn').forEach(b => b.removeClass('active'));
                (e.target as HTMLElement).addClass('active');

                const fresh = await this.getDataForRange(allLogs);

                // Update subtitle
                const subtitle = wrapper.querySelector('.analytics-subtitle');
                if (subtitle) {
                    subtitle.textContent = `Showing ${fresh.periodLabel}${fresh.isWeeklyBuckets ? ' · weekly buckets' : ''}.`;
                }

                this.renderSVGGraph(wrapper.querySelector('#lv999-svg-graph-container') as HTMLElement, fresh.data, this.selectedMetric, fresh.isWeeklyBuckets);
                this.renderSummaryCards(wrapper.querySelector('#lv999-analytics-summary-cards') as HTMLElement, fresh.data, this.selectedMetric, fresh.periodLabel, fresh.isWeeklyBuckets);
            });
        });

        // Initial renders
        this.renderSVGGraph(wrapper.querySelector('#lv999-svg-graph-container') as HTMLElement, data, this.selectedMetric, isWeeklyBuckets);
        this.renderSummaryCards(wrapper.querySelector('#lv999-analytics-summary-cards') as HTMLElement, data, this.selectedMetric, periodLabel, isWeeklyBuckets);
    }

    renderSVGGraph(parent: HTMLElement, logs: DailyLogData[], metric: string, isWeeklyBuckets: boolean) {
        parent.empty();

        let getValues: (log: DailyLogData) => number[];
        let strokeColor = '';
        let fillGradientId = '';
        let dualLine = false;
        let unitLabel = '';

        if (metric === 'study') {
            getValues = (l) => [Math.round(l.studySeconds / 60)];
            strokeColor = 'var(--interactive-accent)';
            fillGradientId = 'study-grad';
            unitLabel = isWeeklyBuckets ? 'mins (week total)' : 'minutes';
        } else if (metric === 'xp') {
            getValues = (l) => [parseFloat(l.xpEarned.toFixed(1))];
            strokeColor = '#00bcd4';
            fillGradientId = 'xp-grad';
            unitLabel = isWeeklyBuckets ? 'XP (week total)' : 'XP';
        } else if (metric === 'diamonds') {
            getValues = (l) => [l.diamondsEarned];
            strokeColor = '#e91e63';
            fillGradientId = 'diamonds-grad';
            unitLabel = isWeeklyBuckets ? '💎 (week total)' : 'diamonds';
        } else {
            getValues = (l) => [l.goldEarned, l.silverEarned];
            dualLine = true;
            unitLabel = isWeeklyBuckets ? 'coins (week total)' : 'coins';
        }

        let maxVal = 10;
        logs.forEach(l => {
            getValues(l).forEach(v => { if (v > maxVal) maxVal = v; });
        });
        maxVal = Math.ceil(maxVal * 1.15);
        if (!maxVal || isNaN(maxVal)) maxVal = 10;

        const width = 600;
        const height = 220;
        const paddingLeft = 45;
        const paddingRight = 20;
        const paddingTop = 20;
        const paddingBottom = 38;

        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;

        // How often to draw an X-axis label so text doesn't overlap
        // weekly=every1, monthly=every5, alltime depends on bucket count
        const n = logs.length;
        let labelEvery = 1;
        if (n > 60) labelEvery = Math.ceil(n / 12);
        else if (n > 20) labelEvery = 5;
        else if (n > 10) labelEvery = 3;

        let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;

        svgContent += `
            <defs>
                <linearGradient id="study-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--interactive-accent)" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="var(--interactive-accent)" stop-opacity="0.00"/>
                </linearGradient>
                <linearGradient id="xp-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#00bcd4" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="#00bcd4" stop-opacity="0.00"/>
                </linearGradient>
                <linearGradient id="diamonds-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#e91e63" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="#e91e63" stop-opacity="0.00"/>
                </linearGradient>
                <linearGradient id="gold-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#ffc107" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="#ffc107" stop-opacity="0.00"/>
                </linearGradient>
            </defs>
        `;

        // Gridlines + Y-axis labels
        const gridLinesCount = 5;
        for (let i = 0; i < gridLinesCount; i++) {
            const ratio = i / (gridLinesCount - 1);
            const y = height - paddingBottom - ratio * chartHeight;
            const gridVal = (ratio * maxVal).toFixed(0);
            svgContent += `
                <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--background-modifier-border)" stroke-dasharray="4 4" stroke-opacity="0.65" />
                <text x="${paddingLeft - 10}" y="${y + 4}" font-size="9" font-weight="600" fill="var(--text-muted)" text-anchor="end">${gridVal}</text>
            `;
        }

        // X-axis label helpers
        const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        /**
         * Returns the primary (top) and secondary (bottom) x-axis label for a data point.
         * For weekly  → day abbrev / MM-DD
         * For monthly → day abbrev / MM-DD  (sparser via labelEvery)
         * For alltime → "Mon DD" / Month abbrev  (week buckets)
         */
        const getXLabels = (dateStr: string): { primary: string; secondary: string } => {
            const parts = dateStr.split('-').map(Number);
            const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
            if (isWeeklyBuckets) {
                return {
                    primary: `${MONTHS_SHORT[d.getMonth()]!} ${d.getDate()}`,
                    secondary: String(d.getFullYear())
                };
            }
            return {
                primary: DAYS_SHORT[d.getDay()] ?? '',
                secondary: dateStr.slice(5)
            };
        };

        // Build point arrays
        const points: { x: number; y: number; val: number; dateStr: string; primary: string; secondary: string }[][] =
            dualLine ? [[], []] : [[]];

        logs.forEach((log, index) => {
            const ratioX = logs.length > 1 ? index / (logs.length - 1) : 0.5;
            const x = paddingLeft + ratioX * chartWidth;
            const { primary, secondary } = getXLabels(log.dateStr);

            const vals = getValues(log);
            vals.forEach((val, valIdx) => {
                const ratioY = val / maxVal;
                const y = height - paddingBottom - ratioY * chartHeight;
                const arr = points[valIdx];
                if (arr) arr.push({ x, y, val, dateStr: log.dateStr, primary, secondary });
            });
        });

        // X-axis labels (sparse for dense datasets)
        const primaryPoints = points[0];
        if (primaryPoints) {
            primaryPoints.forEach((pt, idx) => {
                if (idx % labelEvery !== 0 && idx !== primaryPoints.length - 1) return;
                svgContent += `
                    <text x="${pt.x}" y="${height - 20}" font-size="10" font-weight="700" fill="var(--text-normal)" text-anchor="middle">${pt.primary}</text>
                    <text x="${pt.x}" y="${height - 6}" font-size="8.5" font-weight="500" fill="var(--text-faint)" text-anchor="middle">${pt.secondary}</text>
                `;
            });
        }

        // Draw dot radius based on density (smaller when many points)
        const dotR   = n > 30 ? 3   : n > 14 ? 4 : 5;
        const dotSW  = n > 30 ? 2   : n > 14 ? 2.5 : 3;
        const lineSW = n > 30 ? 2.5 : n > 14 ? 3   : 3.5;

        if (!dualLine) {
            const pts = points[0];
            if (pts && pts.length > 0) {
                const pt0 = pts[0]!;
                const ptLast = pts[pts.length - 1]!;

                // Area
                let areaPath = `M ${pt0.x} ${height - paddingBottom} `;
                pts.forEach(pt => { areaPath += `L ${pt.x} ${pt.y} `; });
                areaPath += `L ${ptLast.x} ${height - paddingBottom} Z`;

                // Line
                let linePath = `M ${pt0.x} ${pt0.y} `;
                for (let i = 1; i < pts.length; i++) {
                    const pt = pts[i]!;
                    linePath += `L ${pt.x} ${pt.y} `;
                }

                svgContent += `<path d="${areaPath}" fill="url(#${fillGradientId})" />`;
                svgContent += `<path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="${lineSW}" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 3px 6px color-mix(in srgb, ${strokeColor} 35%, transparent));" />`;

                // Only draw dots when there are few enough points to be legible
                if (n <= 60) {
                    pts.forEach(pt => {
                        svgContent += `
                            <circle cx="${pt.x}" cy="${pt.y}" r="${dotR}" fill="var(--background-primary)" stroke="${strokeColor}" stroke-width="${dotSW}" style="cursor: pointer;">
                                <title>${pt.dateStr} (${pt.primary})\n${pt.val} ${unitLabel}</title>
                            </circle>
                        `;
                    });
                }
            }
        } else {
            // Dual-line: Gold + Silver
            const colors = ['#ffc107', '#9e9e9e'];
            const labelNames = ['Gold', 'Silver'];

            points.forEach((pts, lineIdx) => {
                const color = colors[lineIdx] ?? '#fff';
                if (pts && pts.length > 0) {
                    const pt0 = pts[0]!;
                    let linePath = `M ${pt0.x} ${pt0.y} `;
                    for (let i = 1; i < pts.length; i++) {
                        const pt = pts[i]!;
                        linePath += `L ${pt.x} ${pt.y} `;
                    }
                    svgContent += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="${lineSW}" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 3px 6px color-mix(in srgb, ${color} 30%, transparent));" />`;

                    if (n <= 60) {
                        pts.forEach(pt => {
                            svgContent += `
                                <circle cx="${pt.x}" cy="${pt.y}" r="${dotR}" fill="var(--background-primary)" stroke="${color}" stroke-width="${dotSW}" style="cursor: pointer;">
                                    <title>${pt.dateStr} (${pt.primary})\n${pt.val} ${labelNames[lineIdx] ?? ''} Coins</title>
                                </circle>
                            `;
                        });
                    }
                }
            });

            // Coin legend (top-right)
            svgContent += `
                <circle cx="${width - paddingRight - 70}" cy="${paddingTop + 6}" r="4" fill="#ffc107"/>
                <text x="${width - paddingRight - 63}" y="${paddingTop + 10}" font-size="9" font-weight="600" fill="var(--text-muted)">Gold</text>
                <circle cx="${width - paddingRight - 35}" cy="${paddingTop + 6}" r="4" fill="#9e9e9e"/>
                <text x="${width - paddingRight - 28}" y="${paddingTop + 10}" font-size="9" font-weight="600" fill="var(--text-muted)">Silver</text>
            `;
        }

        svgContent += `</svg>`;
        parent.innerHTML = svgContent;
    }

    renderSummaryCards(parent: HTMLElement, logs: DailyLogData[], metric: string, periodLabel: string, isWeeklyBuckets: boolean) {
        parent.empty();

        const n = logs.length;
        const dividerLabel = isWeeklyBuckets ? `${n} wk` : `${n} days`;
        const todayStr = DailyLogger.getTodayStr();
        const todayLog = logs.find(l => l.dateStr === todayStr);

        let totalVal = '';
        let avgVal = '';
        let todayDisplay = '';
        let totalLabel = '';
        let themeClass = '';

        if (metric === 'study') {
            const totalSecs = logs.reduce((acc, l) => acc + l.studySeconds, 0);
            const totalMins = Math.round(totalSecs / 60);
            const avgMins = Math.round(totalMins / n);
            const todayMins = Math.round((todayLog?.studySeconds ?? 0) / 60);

            totalLabel = `Total Study Time (${periodLabel})`;
            totalVal = totalMins >= 60
                ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`
                : `${totalMins} mins`;
            avgVal = `${avgMins} mins / ${isWeeklyBuckets ? 'week' : 'day'}`;
            todayDisplay = `${todayMins} mins`;
            themeClass = 'study';
        } else if (metric === 'xp') {
            const total = logs.reduce((acc, l) => acc + l.xpEarned, 0);
            totalLabel = `Total XP Earned (${periodLabel})`;
            totalVal = `${total.toFixed(1)} XP`;
            avgVal = `${(total / n).toFixed(1)} XP / ${isWeeklyBuckets ? 'week' : 'day'}`;
            todayDisplay = `${(todayLog?.xpEarned ?? 0).toFixed(1)} XP`;
            themeClass = 'xp';
        } else if (metric === 'diamonds') {
            const total = logs.reduce((acc, l) => acc + l.diamondsEarned, 0);
            totalLabel = `Total Diamonds (${periodLabel})`;
            totalVal = `${total} 💎`;
            avgVal = `${(total / n).toFixed(1)} 💎 / ${isWeeklyBuckets ? 'week' : 'day'}`;
            todayDisplay = `${todayLog?.diamondsEarned ?? 0} 💎`;
            themeClass = 'diamonds';
        } else {
            const goldTotal   = logs.reduce((acc, l) => acc + l.goldEarned, 0);
            const silverTotal = logs.reduce((acc, l) => acc + l.silverEarned, 0);
            const goldToday   = todayLog?.goldEarned ?? 0;
            const silverToday = todayLog?.silverEarned ?? 0;

            totalLabel = `Total Loot (${periodLabel})`;
            totalVal = `⭐️ ${goldTotal}G  ·  🪙 ${silverTotal}S`;
            avgVal = `⭐️ ${(goldTotal / n).toFixed(1)}G  ·  🪙 ${(silverTotal / n).toFixed(1)}S / ${isWeeklyBuckets ? 'week' : 'day'}`;
            todayDisplay = `⭐️ ${goldToday}G  ·  🪙 ${silverToday}S`;
            themeClass = 'coins';
        }

        parent.innerHTML = `
            <div class="analytics-card ${themeClass}">
                <div class="card-title">Period Total</div>
                <div class="card-value">${totalVal}</div>
                <div class="card-desc">${totalLabel}</div>
            </div>

            <div class="analytics-card ${themeClass}">
                <div class="card-title">Average · ${dividerLabel}</div>
                <div class="card-value">${avgVal}</div>
                <div class="card-desc">Mean across ${dividerLabel}</div>
            </div>

            <div class="analytics-card ${themeClass} today-highlight">
                <div class="card-title">Today's Harvest</div>
                <div class="card-value">${todayDisplay}</div>
                <div class="card-desc">Gained today, resets at midnight</div>
            </div>
        `;
    }
}