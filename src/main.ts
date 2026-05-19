import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	Setting,
	moment,
	TFile,
	TFolder,
} from 'obsidian';
import { DEFAULT_SETTINGS, NovaSettings, SampleSettingTab } from './settings';

export default class Nova extends Plugin {
	settings: NovaSettings;

	async onload() {
		await this.loadSettings();

		// ── Ribbon: RAW JSON import (always available) ─────────────────────
		this.addRibbonIcon('pencil', 'Import RAW', (evt: MouseEvent) => {
			new ImportQuestionsModal(this.app, this).open();
		});

		// ── Ribbon: PDF → Gemini (only shown when a PDF is active) ─────────
		const pdfRibbonIcon = this.addRibbonIcon(
			'file-scan',
			'Analyse PDF with Gemini',
			(evt: MouseEvent) => {
				const pdfFile = this.getActivePdfFile();
				if (!pdfFile) {
					new Notice('⚠️ Open a PDF file first, then click this button.');
					return;
				}
				new GeminiPdfModal(this.app, this, pdfFile).open();
			}
		);

		// ── Command: Import from JSON ──────────────────────────────────────
		this.addCommand({
			id: 'import-wrong-questions-json',
			name: 'Import wrong questions from JSON',
			callback: () => {
				new ImportQuestionsModal(this.app, this).open();
			},
		});

		// ── Command: Analyse PDF with Gemini (PDF-context-aware) ──────────
		this.addCommand({
			id: 'analyse-pdf-gemini',
			name: 'Analyse PDF with Gemini',
			// checkCallback only runs when the condition is met;
			// the command won't appear in the palette otherwise.
			checkCallback: (checking: boolean) => {
				const pdfFile = this.getActivePdfFile();
				if (!pdfFile) return false;
				if (!checking) {
					new GeminiPdfModal(this.app, this, pdfFile).open();
				}
				return true;
			},
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<NovaSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Returns the TFile if the currently active leaf is a PDF, else null. */
	getActivePdfFile(): TFile | null {
		const leaf = this.app.workspace.activeLeaf;
		if (!leaf) return null;
		const view = leaf.view;
		// Obsidian's built-in PDF viewer uses type 'pdf'
		if (view.getViewType() === 'pdf') {
			// @ts-ignore – accessing internal 'file' property
			const file: TFile | undefined = view.file;
			return file ?? null;
		}
		return null;
	}
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYamlTopics(topic: string | string[] | undefined): string {
	if (!topic) return '';
	const arr = Array.isArray(topic) ? topic : [topic];
	return arr.map(t => `- ${t}`).join('\n');
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
}

function getQuestionSnippet(question: string, wordCount = 5): string {
	if (!question) return 'Untitled Question';
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

async function createNotesFromQuestions(
	app: App,
	plugin: Nova,
	parsed: QuestionsJson
): Promise<{ created: number; skipped: number }> {
	const { vault } = app;
	const rootPath = (plugin.settings.wrongQuestionsFolder ?? 'Got Wrong').replace(/\/$/, '');
	const creationDate = moment().format('YYYY-MM-DD HH:mm');
	let created = 0;
	let skipped = 0;

	if (!vault.getAbstractFileByPath(rootPath)) {
		await vault.createFolder(rootPath);
	}

	for (const q of parsed.questions) {
		try {
			const subject = q.subject ? q.subject.trim() : 'Unsorted';
			const topic = Array.isArray(q.topic) ? q.topic[0] : (q.topic ?? '');

			const subjectPath = `${rootPath}/${sanitizeFilename(subject)}`;
			if (!vault.getAbstractFileByPath(subjectPath)) {
				await vault.createFolder(subjectPath);
			}

			const snippet = getQuestionSnippet(q.question ?? '');
			const topicSuffix = topic ? ` - ${topic}` : '';
			const baseName = sanitizeFilename(`${snippet}${topicSuffix}`);
			let finalPath = `${subjectPath}/${baseName}.md`;

			let counter = 1;
			while (vault.getAbstractFileByPath(finalPath)) {
				finalPath = `${subjectPath}/${baseName} (${counter}).md`;
				counter++;
			}

			await vault.create(finalPath, buildMarkdown(q, creationDate));
			created++;
		} catch (err) {
			console.error('[Nova] Error creating note:', err);
			skipped++;
		}
	}
	return { created, skipped };
}

// ── Gemini Models ─────────────────────────────────────────────────────────────

const GEMINI_MODELS = [
	{
		id: 'gemini-3-flash-preview',
		label: 'Gemini 3.0 Flash',
		desc: 'Fast, efficient — great for large PDFs',
	},
	{
		id: 'gemini-3.1-pro-preview',
		label: 'Gemini 3.1 Pro',
		desc: 'Most capable, slower',
	},
	{
		id: 'gemma-3-27b-it',
		label: 'Gemma 3 27B IT',
		desc: 'Open-weights instruction-tuned model',
	},
] as const;

type GeminiModelId = (typeof GEMINI_MODELS)[number]['id'];

// ── Gemini PDF Modal ──────────────────────────────────────────────────────────

/**
 * Three-step modal:
 *  Step 1 — Choose model
 *  Step 2 — Choose API key
 *  Step 3 — Choose prompt  →  call Gemini  →  create notes
 */
class GeminiPdfModal extends Modal {
	private plugin: Nova;
	private pdfFile: TFile;

	private selectedModel: GeminiModelId = GEMINI_MODELS[0].id;
	private selectedApiKeyIndex = 0;
	private selectedPromptIndex = 0;

	private step = 1;

	constructor(app: App, plugin: Nova, pdfFile: TFile) {
		super(app);
		this.plugin = plugin;
		this.pdfFile = pdfFile;
	}

	onOpen() {
		this.renderStep();
	}

	onClose() {
		this.contentEl.empty();
	}

	// ── Step router ──────────────────────────────────────────────────────────

	private renderStep() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('nova-gemini-modal');
		this.applyModalStyles();

		// Progress indicator
		const progress = contentEl.createDiv({ cls: 'nova-progress' });
		progress.style.cssText =
			'display:flex; gap:6px; align-items:center; margin-bottom:20px;';
		for (let i = 1; i <= 3; i++) {
			const dot = progress.createDiv();
			dot.style.cssText = `width:28px; height:4px; border-radius:2px; background:${
				i <= this.step
					? 'var(--interactive-accent)'
					: 'var(--background-modifier-border)'
			};`;
		}
		const label = progress.createEl('span', {
			text: `Step ${this.step} of 3`,
		});
		label.style.cssText =
			'font-size:11px; color:var(--text-muted); margin-left:6px;';

		// File badge
		const badge = contentEl.createDiv();
		badge.style.cssText =
			'display:inline-flex; align-items:center; gap:6px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); border-radius:6px; padding:4px 10px; font-size:12px; color:var(--text-muted); margin-bottom:18px;';
		badge.createEl('span', { text: '📄' });
		badge.createEl('span', { text: this.pdfFile.name });

		switch (this.step) {
			case 1: return this.renderModelStep();
			case 2: return this.renderApiKeyStep();
			case 3: return this.renderPromptStep();
		}
	}

	// ── Step 1: Model ────────────────────────────────────────────────────────

	private renderModelStep() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Choose a Gemini Model' });

		const grid = contentEl.createDiv();
		grid.style.cssText =
			'display:flex; flex-direction:column; gap:8px; margin:16px 0 24px;';

		GEMINI_MODELS.forEach(model => {
			const card = grid.createDiv();
			const isSelected = this.selectedModel === model.id;
			card.style.cssText = `
				display:flex; align-items:flex-start; gap:12px;
				border:2px solid ${isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};
				border-radius:8px; padding:12px 14px; cursor:pointer;
				background:${isSelected ? 'var(--background-secondary-alt)' : 'var(--background-secondary)'};
				transition: border-color 0.15s, background 0.15s;
			`;

			const radio = card.createEl('input');
			radio.type = 'radio';
			radio.name = 'gemini-model';
			radio.value = model.id;
			radio.checked = isSelected;
			radio.style.cssText = 'margin-top:3px; accent-color:var(--interactive-accent); flex-shrink:0;';

			const textWrap = card.createDiv();
			textWrap.createEl('div', { text: model.label }).style.cssText =
				'font-weight:600; font-size:14px; color:var(--text-normal);';
			textWrap.createEl('div', { text: model.desc }).style.cssText =
				'font-size:12px; color:var(--text-muted); margin-top:2px;';

			const selectCard = () => {
				this.selectedModel = model.id;
				grid.querySelectorAll<HTMLDivElement>('.nova-model-card').forEach(c => {
					c.style.borderColor = 'var(--background-modifier-border)';
					c.style.background = 'var(--background-secondary)';
					(c.querySelector('input') as HTMLInputElement).checked = false;
				});
				card.style.borderColor = 'var(--interactive-accent)';
				card.style.background = 'var(--background-secondary-alt)';
				radio.checked = true;
			};

			card.addClass('nova-model-card');
			card.addEventListener('click', selectCard);
			radio.addEventListener('change', selectCard);
		});

		this.renderNavButtons(contentEl, null, () => {
			this.step = 2;
			this.renderStep();
		});
	}

	// ── Step 2: API Key ──────────────────────────────────────────────────────

	private renderApiKeyStep() {
		const { contentEl } = this;
		const keys = this.plugin.settings.geminiApiKeys;

		contentEl.createEl('h2', { text: 'Choose an API Key' });

		if (keys.length === 0) {
			const warn = contentEl.createDiv();
			warn.style.cssText =
				'padding:16px; background:var(--background-modifier-error); border-radius:8px; color:var(--text-error); font-size:13px; margin:12px 0;';
			warn.setText(
				'⚠️ No API keys configured. Go to Settings → Nova Plugin Settings to add a Gemini API key.'
			);
			this.renderNavButtons(
				contentEl,
				() => { this.step = 1; this.renderStep(); },
				null
			);
			return;
		}

		const list = contentEl.createDiv();
		list.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:16px 0 24px;';

		keys.forEach((entry, idx) => {
			const card = list.createDiv();
			const isSelected = this.selectedApiKeyIndex === idx;
			card.style.cssText = `
				display:flex; align-items:center; gap:12px;
				border:2px solid ${isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};
				border-radius:8px; padding:10px 14px; cursor:pointer;
				background:${isSelected ? 'var(--background-secondary-alt)' : 'var(--background-secondary)'};
			`;

			const radio = card.createEl('input');
			radio.type = 'radio';
			radio.name = 'api-key';
			radio.value = String(idx);
			radio.checked = isSelected;
			radio.style.cssText = 'accent-color:var(--interactive-accent);';

			const textWrap = card.createDiv();
			textWrap.createEl('div', {
				text: entry.label || `Key ${idx + 1}`,
			}).style.cssText = 'font-weight:600; font-size:14px;';
			// Show masked key
			const masked =
				entry.key.length > 8
					? entry.key.slice(0, 4) + '••••••••' + entry.key.slice(-4)
					: '••••••••';
			textWrap.createEl('div', { text: masked }).style.cssText =
				'font-size:12px; color:var(--text-muted); font-family:var(--font-monospace);';

			const selectCard = () => {
				this.selectedApiKeyIndex = idx;
				list.querySelectorAll<HTMLDivElement>('.nova-key-card').forEach(c => {
					c.style.borderColor = 'var(--background-modifier-border)';
					c.style.background = 'var(--background-secondary)';
					(c.querySelector('input') as HTMLInputElement).checked = false;
				});
				card.style.borderColor = 'var(--interactive-accent)';
				card.style.background = 'var(--background-secondary-alt)';
				radio.checked = true;
			};

			card.addClass('nova-key-card');
			card.addEventListener('click', selectCard);
			radio.addEventListener('change', selectCard);
		});

		this.renderNavButtons(
			contentEl,
			() => { this.step = 1; this.renderStep(); },
			() => { this.step = 3; this.renderStep(); }
		);
	}

	// ── Step 3: Prompt ───────────────────────────────────────────────────────

	private renderPromptStep() {
		const { contentEl } = this;
		const prompts = this.plugin.settings.geminiPrompts;

		contentEl.createEl('h2', { text: 'Choose a Prompt' });

		if (prompts.length === 0) {
			const warn = contentEl.createDiv();
			warn.style.cssText =
				'padding:16px; background:var(--background-modifier-error); border-radius:8px; color:var(--text-error); font-size:13px; margin:12px 0;';
			warn.setText(
				'⚠️ No prompts configured. Go to Settings → Nova Plugin Settings to add prompts.'
			);
			this.renderNavButtons(
				contentEl,
				() => { this.step = 2; this.renderStep(); },
				null
			);
			return;
		}

		const list = contentEl.createDiv();
		list.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:12px 0 8px;';

		prompts.forEach((entry, idx) => {
			const card = list.createDiv();
			const isSelected = this.selectedPromptIndex === idx;
			card.style.cssText = `
				border:2px solid ${isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};
				border-radius:8px; padding:10px 14px; cursor:pointer;
				background:${isSelected ? 'var(--background-secondary-alt)' : 'var(--background-secondary)'};
			`;

			const header = card.createDiv();
			header.style.cssText = 'display:flex; align-items:center; gap:10px;';

			const radio = header.createEl('input');
			radio.type = 'radio';
			radio.name = 'prompt-select';
			radio.value = String(idx);
			radio.checked = isSelected;
			radio.style.cssText = 'accent-color:var(--interactive-accent);';

			header.createEl('span', { text: entry.label || `Prompt ${idx + 1}` }).style.cssText =
				'font-weight:600; font-size:14px;';

			// Preview first 80 chars
			const preview = card.createEl('div', {
				text: entry.prompt.slice(0, 100) + (entry.prompt.length > 100 ? '…' : ''),
			});
			preview.style.cssText =
				'font-size:11px; color:var(--text-muted); margin-top:5px; font-family:var(--font-monospace); line-height:1.4;';

			const selectCard = () => {
				this.selectedPromptIndex = idx;
				list.querySelectorAll<HTMLDivElement>('.nova-prompt-card').forEach(c => {
					c.style.borderColor = 'var(--background-modifier-border)';
					c.style.background = 'var(--background-secondary)';
					(c.querySelector('input') as HTMLInputElement).checked = false;
				});
				card.style.borderColor = 'var(--interactive-accent)';
				card.style.background = 'var(--background-secondary-alt)';
				radio.checked = true;
			};

			card.addClass('nova-prompt-card');
			card.addEventListener('click', selectCard);
			radio.addEventListener('change', selectCard);
		});

		// Summary row
		const summary = contentEl.createDiv();
		summary.style.cssText =
			'background:var(--background-secondary); border-radius:8px; padding:10px 14px; margin:12px 0 20px; font-size:12px; color:var(--text-muted); line-height:1.6;';
		const modelLabel = GEMINI_MODELS.find(m => m.id === this.selectedModel)?.label ?? this.selectedModel;
		const keyLabel = this.plugin.settings.geminiApiKeys[this.selectedApiKeyIndex]?.label || `Key ${this.selectedApiKeyIndex + 1}`;
		summary.innerHTML = `<b>Model:</b> ${modelLabel} &nbsp;·&nbsp; <b>Key:</b> ${keyLabel}`;

		this.renderNavButtons(
			contentEl,
			() => { this.step = 2; this.renderStep(); },
			() => this.runGemini()
		);
	}

	// ── Navigation ───────────────────────────────────────────────────────────

	private renderNavButtons(
		container: HTMLElement,
		onBack: (() => void) | null,
		onNext: (() => void) | null
	) {
		const row = container.createDiv();
		row.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:8px;';

		const cancelBtn = row.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		if (onBack) {
			const backBtn = row.createEl('button', { text: '← Back' });
			backBtn.addEventListener('click', onBack);
		}

		if (onNext) {
			const isLast = this.step === 3;
			const nextBtn = row.createEl('button', {
				text: isLast ? '🚀 Analyse PDF' : 'Next →',
				cls: 'mod-cta',
			});
			nextBtn.addEventListener('click', onNext);
		}
	}

	// ── Gemini Call ──────────────────────────────────────────────────────────

	private async runGemini() {
		const { contentEl } = this;
		const apiKey = this.plugin.settings.geminiApiKeys[this.selectedApiKeyIndex]?.key ?? '';
		const promptText = this.plugin.settings.geminiPrompts[this.selectedPromptIndex]?.prompt ?? '';

		if (!apiKey) {
			new Notice('❌ No API key selected or key is empty.');
			return;
		}
		if (!promptText) {
			new Notice('❌ Prompt is empty.');
			return;
		}

		// Show loading state
		contentEl.empty();
		this.applyModalStyles();
		const loading = contentEl.createDiv();
		loading.style.cssText = 'text-align:center; padding:40px 20px;';
		loading.createEl('div', { text: '⏳' }).style.cssText = 'font-size:40px; margin-bottom:12px;';
		const statusEl = loading.createEl('div', { text: 'Reading PDF…' });
		statusEl.style.cssText = 'font-size:14px; color:var(--text-muted);';

		try {
			// 1. Read PDF bytes from vault
			const pdfBytes = await this.app.vault.readBinary(this.pdfFile);
			const base64Pdf = arrayBufferToBase64(pdfBytes);

			statusEl.setText(`Sending to ${GEMINI_MODELS.find(m => m.id === this.selectedModel)?.label}…`);

			// 2. Call Gemini API (multimodal – inline PDF)
			const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.selectedModel}:generateContent?key=${apiKey}`;

			const body = {
				generationConfig: {
					temperature: 0.2,
					responseMimeType: 'text/plain',
				},
				contents: [
					{
						role: 'user',
						parts: [
							{
								inlineData: {
									mimeType: 'application/pdf',
									data: base64Pdf,
								},
							},
							{
								text: promptText,
							},
						],
					},
				],
			};

			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new Error(`Gemini API error ${res.status}: ${errText}`);
			}

			statusEl.setText('Parsing response…');

			const data = await res.json() as {
				candidates?: Array<{
					content?: { parts?: Array<{ text?: string }> };
				}>;
			};

			const rawText =
				data.candidates?.[0]?.content?.parts
					?.map(p => p.text ?? '')
					.join('') ?? '';

			// Strip possible markdown fences
			const cleanJson = rawText
				.replace(/^```json\s*/i, '')
				.replace(/^```\s*/i, '')
				.replace(/```\s*$/i, '')
				.trim();

			let parsed: QuestionsJson;
			try {
				parsed = JSON.parse(cleanJson) as QuestionsJson;
			} catch {
				// Try to find JSON object within the text
				const match = cleanJson.match(/\{[\s\S]*\}/);
				if (match) {
					parsed = JSON.parse(match[0]) as QuestionsJson;
				} else {
					throw new Error('Could not parse JSON from Gemini response.\n\nRaw response:\n' + rawText.slice(0, 500));
				}
			}

			if (!parsed.questions || !Array.isArray(parsed.questions)) {
				throw new Error('Response JSON is missing a "questions" array.');
			}

			statusEl.setText(`Creating ${parsed.questions.length} notes…`);

			const { created, skipped } = await createNotesFromQuestions(
				this.app,
				this.plugin,
				parsed
			);

			new Notice(`✅ Created ${created} notes from PDF.${skipped ? ` (${skipped} skipped)` : ''}`);
			this.close();
		} catch (err) {
			console.error('[Nova] Gemini error:', err);
			contentEl.empty();
			this.applyModalStyles();
			contentEl.createEl('h2', { text: '❌ Error' });
			const msg = contentEl.createEl('pre');
			msg.style.cssText =
				'white-space:pre-wrap; font-size:12px; color:var(--text-error); background:var(--background-secondary); padding:12px; border-radius:8px; max-height:300px; overflow-y:auto;';
			msg.setText(err instanceof Error ? err.message : String(err));

			const row = contentEl.createDiv();
			row.style.cssText = 'display:flex; gap:8px; margin-top:16px; justify-content:flex-end;';
			const retryBtn = row.createEl('button', { text: '← Back', cls: 'mod-cta' });
			retryBtn.addEventListener('click', () => {
				this.step = 3;
				this.renderStep();
			});
			const closeBtn = row.createEl('button', { text: 'Close' });
			closeBtn.addEventListener('click', () => this.close());
		}
	}

	// ── Styles ────────────────────────────────────────────────────────────────

	private applyModalStyles() {
		const { modalEl } = this;
		modalEl.style.cssText += 'max-width:520px; width:90vw;';
		this.contentEl.style.cssText += 'padding:24px;';
	}
}

// ── Base64 helper ─────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// ── JSON Import Modal (unchanged) ─────────────────────────────────────────────

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
			cls: 'setting-item-description',
		});

		const rootFolderPath = this.plugin.settings.wrongQuestionsFolder ?? 'Got Wrong';
		contentEl.createEl('p', {
			text: `📁 Root destination: ${rootFolderPath}`,
			cls: 'setting-item-description',
		});

		this.textArea = contentEl.createEl('textarea', {
			placeholder: 'Paste JSON here…',
			cls: 'import-questions-textarea',
		});
		this.textArea.style.cssText = `width:100%; min-height:260px; font-family:var(--font-monospace); font-size:13px; resize:vertical; margin:8px 0 12px; padding:10px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-secondary); color:var(--text-normal); box-sizing:border-box;`;

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
		} catch {
			new Notice('❌ Invalid JSON.');
			return;
		}

		if (!parsed.questions || !Array.isArray(parsed.questions)) {
			new Notice('⚠️ JSON must have a "questions" array.');
			return;
		}

		const { created, skipped } = await createNotesFromQuestions(
			this.app,
			this.plugin,
			parsed
		);

		new Notice(`✅ Created ${created} notes in subject subfolders.${skipped ? ` (${skipped} failed)` : ''}`);
		this.close();
	}
}