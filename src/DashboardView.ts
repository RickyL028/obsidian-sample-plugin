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
        
        // Listen to timer events from the main plugin
        this.plugin.onTimerTick = (sessionSecs, todaySecs) => {
            this.updateTimerDisplay(sessionSecs, todaySecs);
        };
        this.plugin.onTimerStateChange = () => {
            this.updateTimerStateUI();
        };

        this.renderDashboard();
    }

    async onClose() {
        // Clean up timer callbacks to prevent leaks
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

        // Record reward in daily logs!
        const todayStr = DailyLogger.getTodayStr();
        const currentLog = await this.plugin.dailyLogger.getLog(todayStr);
        await this.plugin.dailyLogger.updateLog(todayStr, {
            xpEarned: currentLog.xpEarned + task.rewardXp,
            diamondsEarned: currentLog.diamondsEarned + task.rewardDiamond,
            goldEarned: currentLog.goldEarned + task.rewardGold,
            silverEarned: currentLog.silverEarned + task.rewardSilver
        });

        new Notice(`Quest Complete! Gained ${task.rewardXp} XP!`);
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
            // 5 minutes is 300 seconds
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

        // ── Header Panel ─────────────────────────────────────────────
        const header = container.createDiv('lv999-header-panel');
        const reqXp = 8 + (0.037 * this.plugin.settings.level);
        const xpPercent = Math.min(100, (this.plugin.settings.currentXp / reqXp) * 100);

        const nowH = new Date();
        const todayStrH = `${nowH.getFullYear()}-${String(nowH.getMonth() + 1).padStart(2, '0')}-${String(nowH.getDate()).padStart(2, '0')}`;
        const dueTodayCount = activeTasks.filter(
            t => t.type === 'daily' || t.dueDate === todayStrH
        ).length;

        // Render Header Elements
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
                <!-- Study Timer HUD widget -->
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

        // Bind Play/Pause timer toggle button
        header.querySelector('#lv999-timer-toggle-btn')?.addEventListener('click', () => {
            this.plugin.toggleStudyTimer();
        });
        
        // Initialize timer HUD visuals
        this.updateTimerDisplay(this.plugin.studySessionSeconds, this.plugin.settings.todayStudySeconds);
        this.updateTimerStateUI();

        // Bind New Quest button
        header.querySelector('#lv999-add-task-btn')?.addEventListener('click', () => {
            new TaskModal(this.app, this.plugin, null, 'general', async (data) => {
                await this.taskManager.createTask(data);
            }).open();
        });

        // ── Sub-Tabs Navigation ──────────────────────────────────────
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

        // ── Tab Contents ─────────────────────────────────────────────
        const contentArea = container.createDiv('lv999-tab-content');

        if (this.activeTab === 'quests') {
            await this.renderQuestsGrid(contentArea, activeTasks);
        } else {
            await this.renderAnalyticsDashboard(contentArea);
        }
    }

    // ── Render Quests Tab ──────────────────────────────────────────
    async renderQuestsGrid(parent: HTMLElement, activeTasks: TaskData[]) {
        const grid = parent.createDiv('lv999-grid');

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Daily panel shows: tasks typed 'daily' + any other task due today.
        const dailyPanelTasks = activeTasks.filter(
            t => (t.type as string) === 'daily' || (t.dueDate === todayStr && (t.type as string) !== 'daily')
        );

        // Left col: General (Inbox) → Weekly
        const leftCol = grid.createDiv('lv999-col lv999-col-left');
        this.renderTaskPanel(leftCol, 'Inbox', activeTasks.filter(t => t.type === 'general' || !t.type), 'panel-general', 'general');
        this.renderTaskPanel(leftCol, 'Weekly', activeTasks.filter(t => t.type === 'weekly'), 'panel-weekly', 'weekly');

        // Center col: Daily Quests — dominant
        const centerCol = grid.createDiv('lv999-col lv999-col-center');
        this.renderDailyPanel(centerCol, dailyPanelTasks);

        // Right col: Strategic Goals → Forbidden Actions
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

    // ── Render Analytics & Graphs Tab ──────────────────────────────
    async renderAnalyticsDashboard(parent: HTMLElement) {
        const wrapper = parent.createDiv('lv999-analytics-container');

        // Fetch logs
        const allLogs = await this.plugin.dailyLogger.getAllLogs();
        
        // Pad to guarantee exactly the last 7 calendar days are represented (gaps are filled with zeroed logs)
        const last7DaysData: DailyLogData[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            
            const existing = allLogs.find(l => l.dateStr === dateStr);
            if (existing) {
                last7DaysData.push(existing);
            } else {
                last7DaysData.push({
                    dateStr,
                    studySeconds: 0,
                    xpEarned: 0,
                    diamondsEarned: 0,
                    goldEarned: 0,
                    silverEarned: 0
                });
            }
        }

        // Render layout
        wrapper.innerHTML = `
            <div class="analytics-header">
                <div class="analytics-title-wrap">
                    <h3>7-Day Analytics & History</h3>
                    <p class="analytics-subtitle">Track your focus time, quest completions, and loot stats.</p>
                </div>
                <div class="metric-toggles">
                    <button class="metric-btn ${this.selectedMetric === 'study' ? 'active' : ''}" data-metric="study">📚 Study Time</button>
                    <button class="metric-btn ${this.selectedMetric === 'xp' ? 'active' : ''}" data-metric="xp">⚔️ XP Gained</button>
                    <button class="metric-btn ${this.selectedMetric === 'diamonds' ? 'active' : ''}" data-metric="diamonds">💎 Diamonds</button>
                    <button class="metric-btn ${this.selectedMetric === 'coins' ? 'active' : ''}" data-metric="coins">🪙 Coins</button>
                </div>
            </div>
            
            <div class="graph-card">
                <div class="graph-wrapper" id="lv999-svg-graph-container">
                    <!-- Custom SVG chart inserted here -->
                </div>
            </div>
            
            <div class="analytics-cards-grid" id="lv999-analytics-summary-cards">
                <!-- Summary cards generated here -->
            </div>
        `;

        // Bind metric toggles
        wrapper.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const metric = (e.target as HTMLElement).getAttribute('data-metric') as any;
                this.selectedMetric = metric;
                
                // Toggle active state in buttons
                wrapper.querySelectorAll('.metric-btn').forEach(b => b.removeClass('active'));
                (e.target as HTMLElement).addClass('active');
                
                // Re-render only graph and summaries
                this.renderSVGGraph(wrapper.querySelector('#lv999-svg-graph-container') as HTMLElement, last7DaysData, metric);
                this.renderSummaryCards(wrapper.querySelector('#lv999-analytics-summary-cards') as HTMLElement, last7DaysData, metric);
            });
        });

        // Initial render of graph and cards
        this.renderSVGGraph(wrapper.querySelector('#lv999-svg-graph-container') as HTMLElement, last7DaysData, this.selectedMetric);
        this.renderSummaryCards(wrapper.querySelector('#lv999-analytics-summary-cards') as HTMLElement, last7DaysData, this.selectedMetric);
    }

    renderSVGGraph(parent: HTMLElement, logs: DailyLogData[], metric: string) {
        parent.empty();
        
        let getValues: (log: DailyLogData) => number[];
        let strokeColor = '';
        let fillGradientId = '';
        let dualLine = false;
        
        if (metric === 'study') {
            getValues = (l) => [Math.round(l.studySeconds / 60)];
            strokeColor = 'var(--interactive-accent)';
            fillGradientId = 'study-grad';
        } else if (metric === 'xp') {
            getValues = (l) => [parseFloat(l.xpEarned.toFixed(1))];
            strokeColor = '#00bcd4';
            fillGradientId = 'xp-grad';
        } else if (metric === 'diamonds') {
            getValues = (l) => [l.diamondsEarned];
            strokeColor = '#e91e63';
            fillGradientId = 'diamonds-grad';
        } else { // coins
            getValues = (l) => [l.goldEarned, l.silverEarned];
            dualLine = true;
        }

        // Determine Y axis ceiling
        let maxVal = 10;
        logs.forEach(l => {
            const vals = getValues(l);
            vals.forEach(v => {
                if (v > maxVal) maxVal = v;
            });
        });
        
        maxVal = Math.ceil(maxVal * 1.15);
        if (maxVal === 0 || isNaN(maxVal)) maxVal = 10;

        const width = 600;
        const height = 220;
        const paddingLeft = 45;
        const paddingRight = 20;
        const paddingTop = 20;
        const paddingBottom = 35;
        
        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;

        // Custom, wow, responsive SVG template
        let svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">`;
        
        // Define gorgeous gradients
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

        // Horizontal Gridlines & Y-axis labels
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

        // Project Coordinates
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const points: { x: number; y: number; val: number; dateStr: string; label: string }[][] = dualLine ? [[], []] : [[]];
        
        logs.forEach((log, index) => {
            const ratioX = logs.length > 1 ? index / (logs.length - 1) : 0.5;
            const x = paddingLeft + ratioX * chartWidth;
            
            // local time safe parsing
            const dateParts = log.dateStr.split('-').map(Number);
            const yVal = dateParts[0] || 0;
            const mVal = dateParts[1] || 1;
            const dVal = dateParts[2] || 1;
            const date = new Date(yVal, mVal - 1, dVal);
            const dayLabel = daysOfWeek[date.getDay()] || '';
            
            const vals = getValues(log);
            vals.forEach((val, valIdx) => {
                const ratioY = val / maxVal;
                const y = height - paddingBottom - ratioY * chartHeight;
                const ptsArray = points[valIdx];
                if (ptsArray) {
                    ptsArray.push({ x, y, val, dateStr: log.dateStr, label: dayLabel });
                }
            });
        });

        // Draw X-axis labels
        const primaryPoints = points[0];
        if (primaryPoints) {
            primaryPoints.forEach((pt) => {
                svgContent += `
                    <text x="${pt.x}" y="${height - 18}" font-size="10" font-weight="700" fill="var(--text-normal)" text-anchor="middle">${pt.label}</text>
                    <text x="${pt.x}" y="${height - 5}" font-size="8.5" font-weight="500" fill="var(--text-faint)" text-anchor="middle">${pt.dateStr.slice(5)}</text>
                `;
            });
        }

        // Draw curves and shapes
        if (!dualLine) {
            const pts = points[0];
            if (pts && pts.length > 0) {
                const pt0 = pts[0];
                const ptLast = pts[pts.length - 1];
                if (pt0 && ptLast) {
                    // Area Under Curve (Gradient)
                    let areaPath = `M ${pt0.x} ${height - paddingBottom} `;
                    pts.forEach(pt => { areaPath += `L ${pt.x} ${pt.y} `; });
                    areaPath += `L ${ptLast.x} ${height - paddingBottom} Z`;
                    
                    // Line Path
                    let linePath = `M ${pt0.x} ${pt0.y} `;
                    for (let i = 1; i < pts.length; i++) {
                        const pt = pts[i];
                        if (pt) {
                            linePath += `L ${pt.x} ${pt.y} `;
                        }
                    }

                    svgContent += `<path d="${areaPath}" fill="url(#${fillGradientId})" />`;
                    svgContent += `<path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 3px 6px color-mix(in srgb, ${strokeColor} 35%, transparent));" />`;
                    
                    // Circular Dots
                    pts.forEach(pt => {
                        svgContent += `
                            <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="var(--background-primary)" stroke="${strokeColor}" stroke-width="3" style="cursor: pointer;">
                                <title>${pt.dateStr} (${pt.label})\n${pt.val} ${metric === 'study' ? 'minutes' : metric === 'xp' ? 'XP' : 'diamonds'}</title>
                            </circle>
                        `;
                    });
                }
            }
        } else {
            // Coins Dual Line
            const colors = ['#ffc107', '#9e9e9e']; // Gold = Amber, Silver = Grey
            const labels = ['Gold', 'Silver'];
            
            points.forEach((pts, lineIdx) => {
                const color = colors[lineIdx] || '#ffffff';
                if (pts && pts.length > 0) {
                    const pt0 = pts[0];
                    if (pt0) {
                        // Line Path
                        let linePath = `M ${pt0.x} ${pt0.y} `;
                        for (let i = 1; i < pts.length; i++) {
                            const pt = pts[i];
                            if (pt) {
                                linePath += `L ${pt.x} ${pt.y} `;
                            }
                        }
                        
                        svgContent += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 3px 6px color-mix(in srgb, ${color} 30%, transparent));" />`;
                        
                        // Circular Dots
                        pts.forEach(pt => {
                            svgContent += `
                                <circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="var(--background-primary)" stroke="${color}" stroke-width="2.5" style="cursor: pointer;">
                                    <title>${pt.dateStr} (${pt.label})\n${pt.val} ${labels[lineIdx] || ''} Coins</title>
                                </circle>
                            `;
                        });
                    }
                }
            });
        }

        svgContent += `</svg>`;
        parent.innerHTML = svgContent;
    }

    renderSummaryCards(parent: HTMLElement, logs: DailyLogData[], metric: string) {
        parent.empty();
        
        let sum = 0;
        let avg = 0;
        let todayVal = 0;
        
        const todayStr = DailyLogger.getTodayStr();
        const todayLog = logs.find(l => l.dateStr === todayStr);

        let sumLabel = '';
        let sumVal = '';
        let avgVal = '';
        let todayDisplay = '';
        let themeClass = '';

        if (metric === 'study') {
            const totalSecs = logs.reduce((acc, l) => acc + l.studySeconds, 0);
            sum = Math.round(totalSecs / 60);
            avg = Math.round((totalSecs / 7) / 60);
            todayVal = Math.round((todayLog?.studySeconds || 0) / 60);
            
            sumLabel = 'Total Study Time';
            sumVal = `${sum} mins`;
            avgVal = `${avg} mins/day`;
            todayDisplay = `${todayVal} mins`;
            themeClass = 'study';
        } else if (metric === 'xp') {
            sum = logs.reduce((acc, l) => acc + l.xpEarned, 0);
            avg = sum / 7;
            todayVal = todayLog?.xpEarned || 0;
            
            sumLabel = 'Total XP Earned';
            sumVal = `${sum.toFixed(1)} XP`;
            avgVal = `${avg.toFixed(1)} XP/day`;
            todayDisplay = `${todayVal.toFixed(1)} XP`;
            themeClass = 'xp';
        } else if (metric === 'diamonds') {
            sum = logs.reduce((acc, l) => acc + l.diamondsEarned, 0);
            avg = sum / 7;
            todayVal = todayLog?.diamondsEarned || 0;
            
            sumLabel = 'Total Diamonds Gained';
            sumVal = `${sum} 💎`;
            avgVal = `${avg.toFixed(1)} 💎/day`;
            todayDisplay = `${todayVal} 💎`;
            themeClass = 'diamonds';
        } else { // coins
            const goldSum = logs.reduce((acc, l) => acc + l.goldEarned, 0);
            const silverSum = logs.reduce((acc, l) => acc + l.silverEarned, 0);
            const goldToday = todayLog?.goldEarned || 0;
            const silverToday = todayLog?.silverEarned || 0;
            
            sumLabel = 'Weekly Total Loot';
            sumVal = `⭐️ ${goldSum}G  ·  🪙 ${silverSum}S`;
            avgVal = `⭐️ ${(goldSum / 7).toFixed(1)}G  ·  🪙 ${(silverSum / 7).toFixed(1)}S /day`;
            todayDisplay = `⭐️ ${goldToday}G  ·  🪙 ${silverToday}S`;
            themeClass = 'coins';
        }

        parent.innerHTML = `
            <div class="analytics-card ${themeClass}">
                <div class="card-title">Weekly Aggregate</div>
                <div class="card-value">${sumVal}</div>
                <div class="card-desc">${sumLabel} over the last 7 days</div>
            </div>
            
            <div class="analytics-card ${themeClass}">
                <div class="card-title">Daily Average</div>
                <div class="card-value">${avgVal}</div>
                <div class="card-desc">Your daily focus/rewards mean</div>
            </div>
            
            <div class="analytics-card ${themeClass} today-highlight">
                <div class="card-title">Today's Harvest</div>
                <div class="card-value">${todayDisplay}</div>
                <div class="card-desc">Gained today, resets at midnight 00:00</div>
            </div>
        `;
    }
}