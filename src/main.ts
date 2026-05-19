import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, moment, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS, NovaSettings, SampleSettingTab } from "./settings";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function toYamlTopics(topic: string | string[] | undefined): string {
	if (!topic) return '';
	const arr = Array.isArray(topic) ? topic : [topic];
	return arr.map(t => `- ${t}`).join('\n');
}

function sanitizeFilename(name: string): string {
	// Removes characters illegal in Windows/Mac/Linux filenames and Obsidian links
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
}

function getQuestionSnippet(question: string, wordCount: number = 5): string {
	if (!question) return "Untitled Question";
	// Remove markdown headers or bolding for the title snippet
	const cleanQ = question.replace(/[#*`>]/g, '').trim();
	const words = cleanQ.split(/\s+/);
	return words.slice(0, wordCount).join(' ');
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
notes: ${q.note ?? ''}

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

// ── Modal ────────────────────────────────────────────────────────────────────

class ImportQuestionsModal extends Modal {
	private plugin: Nova;
	private textArea: HTMLTextAreaElement;

	constructor(app: App, plugin: Nova) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('import-questions-modal');

		contentEl.createEl('h2', { text: 'Import "Got Wrong" Questions' });
		contentEl.createEl('p', {
			text: 'Paste JSON. Files will be named by question snippet + topic and sorted into subject folders.',
			cls: 'setting-item-description'
		});

		const rootFolderPath = this.plugin.settings.wrongQuestionsFolder ?? 'Got Wrong';
		contentEl.createEl('p', {
			text: `📁 Root destination: ${rootFolderPath}`,
			cls: 'setting-item-description'
		});

		this.textArea = contentEl.createEl('textarea', {
			placeholder: 'Paste JSON here...',
			cls: 'import-questions-textarea'
		});
		this.textArea.style.cssText = `width: 100%; min-height: 260px; font-family: var(--font-monospace); font-size: 13px; resize: vertical; margin: 8px 0 12px; padding: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); box-sizing: border-box;`;

		const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
		btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:4px;';

		const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const importBtn = btnRow.createEl('button', { text: 'Import Questions', cls: 'mod-cta' });
		importBtn.addEventListener('click', () => this.handleImport());

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

		let parsed: QuestionsJson;
		try {
			parsed = JSON.parse(raw) as QuestionsJson;
		} catch (e) {
			new Notice('❌ Invalid JSON.');
			return;
		}

		if (!parsed.questions || !Array.isArray(parsed.questions)) {
			new Notice('⚠️ JSON must have a "questions" array.');
			return;
		}

		const { vault } = this.app;
		const rootPath = (this.plugin.settings.wrongQuestionsFolder ?? 'Got Wrong').replace(/\/$/, '');
		const creationDate = moment().format('YYYY-MM-DD HH:mm');
		
		let created = 0;
		let skipped = 0;

		// 1. Ensure root folder exists
		if (!vault.getAbstractFileByPath(rootPath)) {
			await vault.createFolder(rootPath);
		}

		for (const q of parsed.questions) {
			try {
				const subject = q.subject ? q.subject.trim() : "Unsorted";
				const topic = Array.isArray(q.topic) ? q.topic[0] : (q.topic ?? "");
				
				// 2. Create Subject Subfolder
				const subjectPath = `${rootPath}/${sanitizeFilename(subject)}`;
				if (!vault.getAbstractFileByPath(subjectPath)) {
					await vault.createFolder(subjectPath);
				}

				// 3. Generate Filename (Snippet + Topic)
				const snippet = getQuestionSnippet(q.question ?? "");
				const topicSuffix = topic ? ` - ${topic}` : "";
				const baseName = sanitizeFilename(`${snippet}${topicSuffix}`);
				
				let finalPath = `${subjectPath}/${baseName}.md`;

				// 4. Handle duplicates
				let counter = 1;
				while (vault.getAbstractFileByPath(finalPath)) {
					finalPath = `${subjectPath}/${baseName} (${counter}).md`;
					counter++;
				}

				const content = buildMarkdown(q, creationDate);
				await vault.create(finalPath, content);
				created++;

			} catch (err) {
				console.error('[ImportQuestions] Error creating note:', err);
				skipped++;
			}
		}

		new Notice(`✅ Created ${created} notes in subject subfolders.`);
		this.close();
	}
}