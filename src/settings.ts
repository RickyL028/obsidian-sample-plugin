import { App, PluginSettingTab, Setting } from 'obsidian';
import type Nova from './main';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiKeyEntry {
	label: string;
	key: string;
}

export interface PromptEntry {
	label: string;
	prompt: string;
}

export interface NovaSettings {
	mySetting: string;
	wrongQuestionsFolder: string;
	geminiApiKeys: ApiKeyEntry[];
	geminiPrompts: PromptEntry[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: NovaSettings = {
	mySetting: 'default',
	wrongQuestionsFolder: 'past',
	geminiApiKeys: [],
	geminiPrompts: [
		{
			label: 'Extract Wrong Questions',
			prompt: `You are an expert tutor. Analyse the provided PDF (an exam paper, past paper, or question set).
Extract every question the student got wrong or that is worth reviewing.
Return ONLY a valid JSON object with this exact shape — no markdown fences, no commentary:
{
  "questions": [
    {
      "subject": "<subject name>",
      "topic": ["<topic1>", "<topic2>"],
      "source": "<exam / paper name if visible>",
      "reviewed": "",
      "mastered": "",
      "marks_rewarded": <number or "">,
      "full_marks": <number or "">,
      "question": "<full question text, preserve newlines with \\n>",
      "answer": "<model answer or mark-scheme answer>",
      "note": "<any useful hint or common mistake>"
    }
  ]
}`,
		},
		{
			label: 'Summarise Key Concepts',
			prompt: `Analyse the PDF and extract the key concepts, definitions, and formulas as study notes.
Return ONLY a valid JSON object:
{
  "questions": [
    {
      "subject": "<subject>",
      "topic": ["<topic>"],
      "source": "<source>",
      "reviewed": "",
      "mastered": "",
      "marks_rewarded": "",
      "full_marks": "",
      "question": "<concept / term>",
      "answer": "<definition or explanation>",
      "note": "<memory tip or example>"
    }
  ]
}`,
		},
	],
};

// ── Settings Tab ──────────────────────────────────────────────────────────────

export class SampleSettingTab extends PluginSettingTab {
	plugin: Nova;

	constructor(app: App, plugin: Nova) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Nova Plugin Settings' });

		// ── Wrong Questions Folder ─────────────────────────────────────────────
		new Setting(containerEl)
			.setName('"Got Wrong" questions folder')
			.setDesc('Vault-relative folder where imported question notes will be saved.')
			.addText(text =>
				text
					.setPlaceholder('Got Wrong')
					.setValue(this.plugin.settings.wrongQuestionsFolder)
					.onChange(async value => {
						this.plugin.settings.wrongQuestionsFolder = value.trim() || 'Got Wrong';
						await this.plugin.saveSettings();
					})
			);

		// ── Gemini API Keys ────────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Gemini API Keys' });
		containerEl.createEl('p', {
			text: 'Add one or more Google Gemini API keys. You will choose which key to use each time you run a PDF import.',
			cls: 'setting-item-description',
		});

		const renderApiKeys = () => {
			apiKeysContainer.empty();
			this.plugin.settings.geminiApiKeys.forEach((entry, idx) => {
				const row = new Setting(apiKeysContainer)
					.setName(`Key ${idx + 1}`)
					.addText(text =>
						text
							.setPlaceholder('Label (e.g. Personal key)')
							.setValue(entry.label)
							.onChange(async value => {
								this.plugin.settings.geminiApiKeys[idx].label = value;
								await this.plugin.saveSettings();
							})
					)
					.addText(text => {
						text
							.setPlaceholder('AIza…')
							.setValue(entry.key)
							.onChange(async value => {
								this.plugin.settings.geminiApiKeys[idx].key = value;
								await this.plugin.saveSettings();
							});
						text.inputEl.type = 'password';
						text.inputEl.style.fontFamily = 'var(--font-monospace)';
						text.inputEl.style.width = '260px';
						return text;
					})
					.addButton(btn =>
						btn
							.setIcon('trash')
							.setTooltip('Remove this key')
							.onClick(async () => {
								this.plugin.settings.geminiApiKeys.splice(idx, 1);
								await this.plugin.saveSettings();
								renderApiKeys();
							})
					);
			});

			new Setting(apiKeysContainer).addButton(btn =>
				btn
					.setButtonText('+ Add API Key')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.geminiApiKeys.push({ label: '', key: '' });
						await this.plugin.saveSettings();
						renderApiKeys();
					})
			);
		};

		const apiKeysContainer = containerEl.createDiv();
		renderApiKeys();

		// ── Gemini Prompts ─────────────────────────────────────────────────────
		containerEl.createEl('h3', { text: 'Gemini Prompts' });
		containerEl.createEl('p', {
			text: 'Define prompt templates that will be sent with the PDF. The model is expected to return JSON matching the questions schema.',
			cls: 'setting-item-description',
		});

		const renderPrompts = () => {
			promptsContainer.empty();
			this.plugin.settings.geminiPrompts.forEach((entry, idx) => {
				const wrapper = promptsContainer.createDiv();
				wrapper.style.cssText =
					'border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; margin-bottom: 12px;';

				new Setting(wrapper)
					.setName(`Prompt ${idx + 1} — Label`)
					.addText(text =>
						text
							.setPlaceholder('e.g. Extract Wrong Questions')
							.setValue(entry.label)
							.onChange(async value => {
								this.plugin.settings.geminiPrompts[idx].label = value;
								await this.plugin.saveSettings();
							})
					)
					.addButton(btn =>
						btn
							.setIcon('trash')
							.setTooltip('Remove this prompt')
							.onClick(async () => {
								this.plugin.settings.geminiPrompts.splice(idx, 1);
								await this.plugin.saveSettings();
								renderPrompts();
							})
					);

				new Setting(wrapper).setName('Prompt text').setDesc(
					'Use plain text. The PDF will be attached automatically. Instruct the model to return JSON.'
				);

				const ta = wrapper.createEl('textarea');
				ta.value = entry.prompt;
				ta.style.cssText =
					'width:100%; min-height:140px; font-family:var(--font-monospace); font-size:12px; resize:vertical; padding:8px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-secondary); color:var(--text-normal); box-sizing:border-box; margin-top:4px;';
				ta.addEventListener('change', async () => {
					this.plugin.settings.geminiPrompts[idx].prompt = ta.value;
					await this.plugin.saveSettings();
				});
			});

			new Setting(promptsContainer).addButton(btn =>
				btn
					.setButtonText('+ Add Prompt')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.geminiPrompts.push({ label: 'New Prompt', prompt: '' });
						await this.plugin.saveSettings();
						renderPrompts();
					})
			);
		};

		const promptsContainer = containerEl.createDiv();
		renderPrompts();
	}
}