import {App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, moment} from 'obsidian';
import {DEFAULT_SETTINGS, NovaSettings, SampleSettingTab} from "./settings";

export default class Nova extends Plugin {
	settings: NovaSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('pencil', 'Import RAW', (evt: MouseEvent) => {
			new ImportQuestionsModal(this.app, this).open();
		});


		this.addCommand({
			id: 'import-wrong-questions-json',
			name: 'Import wrong questions from JSON',
			callback: () => {
				new ImportQuestionsModal(this.app, this).open();
			}
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<NovaSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Question {
	subject: string;
	topic?: string | string[];
	source?: string;
	reviewed?: string;
	mastered?: string;
	marks_rewarded?: number | string;
	full_marks?: number | string;
	question?: string;
	answer?: string;
	note?: string;
	[key: string]: unknown;
}

interface QuestionsJson {
	questions: Question[];
}


function toYamlTopics(topic: string | string[] | undefined): string {
	if (!topic) return '';
	const arr = Array.isArray(topic) ? topic : [topic];
	return arr.map(t => `- ${t}`).join('\n');
}

function sanitizeFilename(name: string): string {
	
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
}

function buildMarkdown(q: Question, creationDate: string): string {
	const topics = toYamlTopics(q.topic);

	return `---
subject: ${q.subject ?? ''}
topic:
${topics ? topics : ''}
creation_date: ${creationDate}
source: ${q.source ?? ''}
reviewed: ${q.reviewed ?? ''}
mastered: ${q.mastered ?? ''}
marks_rewarded: ${q.marks_rewarded ?? ''}
full_marks: ${q.full_marks ?? ''}
notes: 

---
### Question

${q.question ?? ''}

--- 
> [!tldr]- Answer
> ${q.answer ?? ''}

--- 
> [!note]- Note
> ${q.note ?? ''}
`;
}


class ImportQuestionsModal extends Modal {
	private plugin: Nova;
	private textArea: HTMLTextAreaElement;

	constructor(app: App, plugin: Nova) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('import-questions-modal');

		// ── Header ────────────────────────────────────────────────────────────
		contentEl.createEl('h2', {text: 'Import "Got Wrong" Questions'});
		contentEl.createEl('p', {
			text: 'Paste your JSON below. Each question will be saved as a separate note in your configured folder.',
			cls: 'setting-item-description'
		});

		// ── Folder info ───────────────────────────────────────────────────────
		const folderPath = this.plugin.settings.wrongQuestionsFolder ?? 'Got Wrong';
		contentEl.createEl('p', {
			text: `📁 Destination folder: ${folderPath}`,
			cls: 'setting-item-description'
		});

		// ── Textarea ──────────────────────────────────────────────────────────
		this.textArea = contentEl.createEl('textarea', {
			placeholder: '{\n  "questions": [\n    {\n      "subject": "Math",\n      "topic": ["Algebra"],\n      "question": "Solve x...",\n      "answer": "x = 2"\n    }\n  ]\n}',
			cls: 'import-questions-textarea'
		});
		this.textArea.style.cssText = `
			width: 100%;
			min-height: 260px;
			font-family: var(--font-monospace);
			font-size: 13px;
			resize: vertical;
			margin: 8px 0 12px;
			padding: 10px;
			border-radius: 6px;
			border: 1px solid var(--background-modifier-border);
			background: var(--background-secondary);
			color: var(--text-normal);
			box-sizing: border-box;
		`;

		// ── Buttons ───────────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv({cls: 'modal-button-container'});
		btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;';

		const cancelBtn = btnRow.createEl('button', {text: 'Cancel'});
		cancelBtn.addEventListener('click', () => this.close());

		const importBtn = btnRow.createEl('button', {text: 'Import Questions', cls: 'mod-cta'});
		importBtn.addEventListener('click', () => this.handleImport());

		// Focus textarea on open
		setTimeout(() => this.textArea.focus(), 50);
	}

	onClose() {
		this.contentEl.empty();
	}

	private async handleImport() {
		const raw = this.textArea.value.trim();

		if (!raw) {
			new Notice('⚠️ Please paste your JSON first.');
			return;
		}

		// ── Parse ─────────────────────────────────────────────────────────────
		let parsed: QuestionsJson;
		try {
			parsed = JSON.parse(raw) as QuestionsJson;
		} catch (e) {
			new Notice('❌ Invalid JSON — please check your input and try again.');
			console.error('[ImportQuestions] JSON parse error:', e);
			return;
		}

		if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
			new Notice('⚠️ JSON must have a non-empty "questions" array.');
			return;
		}

		// ── Ensure folder exists ──────────────────────────────────────────────
		const folderPath = (this.plugin.settings.wrongQuestionsFolder ?? 'past').replace(/\/$/, '');
		const {vault} = this.app;

		if (!vault.getAbstractFileByPath(folderPath)) {
			await vault.createFolder(folderPath);
		}

		// ── Create notes ──────────────────────────────────────────────────────
		const creationDate = moment().format('YYYY-MM-DD HH:mm');
		let created = 0;
		let skipped = 0;

		for (const q of parsed.questions) {
			if (!q.subject) {
				console.warn('[ImportQuestions] Skipping question with no subject:', q);
				skipped++;
				continue;
			}

			const baseTitle = sanitizeFilename(`I got this wrong - ${q.subject}${q.topic ? ' - ' + (Array.isArray(q.topic) ? q.topic[0] : q.topic) : ''}`);
			const filePath = `${folderPath}/${baseTitle}.md`;

			// Avoid overwriting — append a counter if file exists
			let finalPath = filePath;
			let counter = 1;
			while (vault.getAbstractFileByPath(finalPath)) {
				finalPath = `${folderPath}/${baseTitle} (${counter}).md`;
				counter++;
			}

			const content = buildMarkdown(q, creationDate);

			try {
				await vault.create(finalPath, content);
				created++;
			} catch (err) {
				console.error('[ImportQuestions] Failed to create file:', finalPath, err);
				skipped++;
			}
		}

		// ── Done ──────────────────────────────────────────────────────────────
		new Notice(`✅ Created ${created} note${created !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped)` : ''} in "${folderPath}"`);
		this.close();
	}
}

// ── Original sample modal (kept for existing commands) ───────────────────────

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}