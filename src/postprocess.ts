/**
 * 输出后处理
 *
 * 1) cleanAssistantText：送往 LLM 的历史卫生（D9 few-shot 防增殖；会话文件仍保留原文）
 * 2) displayAssistantText：Web 显示层卫生——ST 预设常用「假思维链 / 草稿 / 正文包装 / 状态块」
 *    靠正则隐去，梨园无 ST 正则，必须在展示通道剥脚手架，只露叙事正文（D10：不改写正文用字，
 *    只拆掉非叙事包装）。
 */

/** 整块剥离（分析 / 假思维链 / 草稿 / 状态类，用户不应当正文读） */
export const STRIP_BLOCK_TAGS = [
	"descriptive_analysis",
	"normal_status",
	"special_status",
	"thinking",
	"think",
	"draft_notes",
	"draft",
	"reasoning",
	"status",
	"statusbar",
	"StatusBlock",
	"status_block",
	"statusblock",
];

/** 只拆包装保留内容（正文容器类） */
export const UNWRAP_BLOCK_TAGS = ["plot", "splot", "content", "narrative", "main", "story", "正文"];

const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripBlocks(text: string, tags: string[]): string {
	let t = text;
	for (const tag of tags) {
		const k = escapeReg(tag);
		t = t.replace(new RegExp(`<${k}(?:\\s[^>]*)?>[\\s\\S]*?</${k}>`, "gi"), "");
		// 悬挂开标签（截断输出）：剥到末尾
		t = t.replace(new RegExp(`<${k}(?:\\s[^>]*)?>[\\s\\S]*$`, "gi"), "");
	}
	return t;
}

function unwrapBlocks(text: string, tags: string[]): string {
	let t = text;
	for (const tag of tags) {
		const k = escapeReg(tag);
		t = t.replace(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)</${k}>`, "gi"), "$1");
		t = t.replace(new RegExp(`</?${k}(?:\\s[^>]*)?>`, "gi"), "");
	}
	return t;
}

/** 空白收敛 */
function tidyWhitespace(text: string): string {
	return text
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** 历史送模用：剥脚手架，拆正文包装 */
export function cleanAssistantText(text: string): string {
	let t = stripBlocks(text, STRIP_BLOCK_TAGS);
	t = unwrapBlocks(t, UNWRAP_BLOCK_TAGS);
	return tidyWhitespace(t);
}

/**
 * 显示层用：在 clean 基础上再处理 ST 预设常见噪音。
 * - HTML 注释（如 <!-- Prism: ... -->）
 * - 「### 正文」类分隔标题
 * - 残留的单独标签行
 */
export function displayAssistantText(text: string): string {
	let t = text;
	// 先抽出假思维/草稿整块（与 STRIP 一致）
	t = stripBlocks(t, STRIP_BLOCK_TAGS);
	// 正文容器拆包
	t = unwrapBlocks(t, UNWRAP_BLOCK_TAGS);
	// ST/预设常用 HTML 注释作导演旁注
	t = t.replace(/<!--[\s\S]*?-->/g, "");
	// 常见分隔标题（单独成行）
	t = t.replace(/^\s*#{1,6}\s*正文\s*$/gim, "");
	t = t.replace(/^\s*#{1,6}\s*(thinking|draft|notes?|status)\s*$/gim, "");
	// 残留空标签行
	t = t.replace(/^\s*<\/?[A-Za-z][\w-]*\s*>\s*$/gm, "");
	return tidyWhitespace(t);
}

/**
 * 从助手原文中抽出应折叠展示的「假思维链」块（供 UI ThinkingBlock）。
 * 不改写叙事，只额外提供可折叠元信息。
 */
export function extractScaffoldThinking(text: string): string {
	const parts: string[] = [];
	for (const tag of ["thinking", "think", "draft_notes", "draft", "reasoning", "descriptive_analysis"]) {
		const k = escapeReg(tag);
		const re = new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)</${k}>`, "gi");
		let m: RegExpExecArray | null;
		while ((m = re.exec(text)) !== null) {
			const body = m[1].trim();
			if (body) parts.push(body);
		}
	}
	return parts.join("\n\n---\n\n").trim();
}
