/**
 * 角色卡常见「状态栏」标签的展示层拆分。
 *
 * 标签本身（&lt;StatusBlock&gt; 等）从不进入正文；只抽出 body 画面板。
 */

export type StatusPart =
	| { kind: "text"; text: string }
	| { kind: "status"; tag: string; body: string };

/** 规范化标签名（小写 + 去下划线）便于匹配 */
export function normalizeStatusTag(tag: string): string {
	return tag.toLowerCase().replace(/_/g, "");
}

/** 已知标签 → 中文标题（键用 normalizeStatusTag） */
const LABEL_BY_NORM: Record<string, string> = {
	normalstatus: "场景状态",
	specialstatus: "人物状态",
	statusblock: "状态",
	status: "状态",
	statusbar: "状态",
	plot: "剧情",
	splot: "支线",
	descriptiveanalysis: "描写分析",
	nextcharacterpanel: "角色登场",
};

/** 开标签名列表（原始写法，正则用） */
const KNOWN_TAG_ALTS = [
	"normal_status",
	"special_status",
	"StatusBlock",
	"status_block",
	"statusblock",
	"status",
	"statusbar",
	"plot",
	"splot",
	"descriptive_analysis",
	"NextCharacterPanel",
];

const OPEN_RE = new RegExp(`<(${KNOWN_TAG_ALTS.join("|")})(?:\\s[^>]*)?>`, "gi");

/** plot / splot 闭合互通；StatusBlock 族互通 */
function closePattern(tag: string): RegExp {
	const n = normalizeStatusTag(tag);
	if (n === "plot" || n === "splot") return /<\/(?:plot|splot)\s*>/i;
	if (n === "statusblock" || n === "status" || n === "statusbar") {
		return /<\/(?:StatusBlock|status_block|statusblock|status|statusbar)\s*>/i;
	}
	if (n === "normalstatus") return /<\/normal_status\s*>/i;
	if (n === "specialstatus") return /<\/special_status\s*>/i;
	return new RegExp(`</${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*>`, "i");
}

/**
 * 顺序扫描：开标签 → 闭合 → body 进 status 段；标签本身不进 text 段。
 */
export function splitStatusParts(text: string): StatusPart[] {
	if (!text) return [];
	const parts: StatusPart[] = [];
	let cursor = 0;
	OPEN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = OPEN_RE.exec(text)) !== null) {
		const openStart = m.index;
		const openEnd = m.index + m[0].length;
		const tag = m[1];
		if (openStart > cursor) {
			const chunk = text.slice(cursor, openStart);
			if (chunk) parts.push({ kind: "text", text: stripOrphanStatusTags(chunk) });
		}

		const rest = text.slice(openEnd);
		const closeRe = closePattern(tag);
		const closeM = closeRe.exec(rest);
		let body: string;
		let nextCursor: number;

		if (closeM && closeM.index >= 0) {
			body = rest.slice(0, closeM.index);
			nextCursor = openEnd + closeM.index + closeM[0].length;
		} else {
			OPEN_RE.lastIndex = openEnd;
			const nextOpen = OPEN_RE.exec(text);
			if (nextOpen && nextOpen.index >= openEnd) {
				body = text.slice(openEnd, nextOpen.index);
				nextCursor = nextOpen.index;
			} else {
				body = text.slice(openEnd);
				nextCursor = text.length;
			}
		}

		body = body.replace(/^\uFEFF/, "").trim();
		const norm = normalizeStatusTag(tag);
		if (norm !== "descriptiveanalysis" && body) {
			parts.push({ kind: "status", tag: norm, body });
		}
		cursor = nextCursor;
		OPEN_RE.lastIndex = cursor;
	}
	if (cursor < text.length) {
		const rest = stripOrphanStatusTags(text.slice(cursor));
		if (rest) parts.push({ kind: "text", text: rest });
	}
	return parts.length > 0 ? parts : [{ kind: "text", text: stripOrphanStatusTags(text) }];
}

/** 兜底：正文段里若还残留状态标签字样，删掉 */
export function stripOrphanStatusTags(text: string): string {
	return text
		.replace(/<\/?(?:StatusBlock|status_block|statusblock|status|statusbar|normal_status|special_status)(?:\s[^>]*)?>/gi, "")
		.replace(/^\s*$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function statusLabel(tag: string): string {
	const n = normalizeStatusTag(tag);
	return LABEL_BY_NORM[n] ?? "状态";
}

/** CSS 用的稳定 class 后缀 */
export function statusClassSuffix(tag: string): string {
	const n = normalizeStatusTag(tag);
	if (n === "statusblock" || n === "status" || n === "statusbar") return "statusblock";
	if (n === "specialstatus") return "special_status";
	if (n === "normalstatus") return "normal_status";
	return n || "status";
}

export function looksLikeYamlBlock(body: string): boolean {
	const t = body.trim();
	if (/^```ya?ml\b/i.test(t)) return true;
	const lines = t.split(/\r?\n/).filter((l) => l.trim());
	if (lines.length < 2) return false;
	const kv = lines.filter((l) => /[:：]/.test(l)).length;
	return kv >= Math.ceil(lines.length * 0.5);
}

export function stripYamlFence(body: string): string {
	const t = body.trim();
	const m = /^```ya?ml\s*\r?\n([\s\S]*?)```\s*$/i.exec(t);
	return m ? m[1].trim() : t;
}
