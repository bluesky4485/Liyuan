/**
 * 场外发言检测——单一事实来源（server 路由、wire 翻译、楼层计数共用）。
 *
 * **语义变更（2026-07-14 职责拆分）**：带场外标记的消息在 harness 层直接改道
 * 右栏「助手」会话（stripBackstageMarker 剥标记后送达）；剧情会话不再有
 * 戏内/戏外双姿态——剧情模型只演戏。isBackstageText 仍保留三个用途：
 * - server：输入路由的咽喉点（标记 → 助手会话）；
 * - wire/楼层：旧会话历史里遗留的戏外轮照旧折叠渲染、不占楼层；
 * - 场记/swipe：跳过旧会话的戏外轮（新会话不再产生）。
 *
 * 识别的标记（RP 社区通行习惯）：
 * - `//` 开头（CLI 习惯）
 * - `((` / `（（` 开头（ST 社区 OOC 双括号）
 * - 整条消息被单层括号包裹（`(…)` / `（…）`）
 */
export function isBackstageText(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	if (t.startsWith("//") || t.startsWith("((") || t.startsWith("（（")) return true;
	const first = t[0];
	const last = t[t.length - 1];
	return (first === "(" || first === "（") && (last === ")" || last === "）");
}

/**
 * 剥掉场外标记，取用户真正想说的话（改道助手会话时用）：
 * `//text`、`((text))`、`（（text））`、整条 `(text)` / `（text）` → text。
 * 剥完为空时返回原文（防御畸形输入）。
 */
export function stripBackstageMarker(text: string): string {
	const t = text.trim();
	if (!t) return t;
	let out = t;
	if (t.startsWith("//")) {
		out = t.slice(2);
	} else if (t.startsWith("((") || t.startsWith("（（")) {
		out = t.slice(2);
		const tail = out.trimEnd();
		if (tail.endsWith("))") || tail.endsWith("））")) out = tail.slice(0, -2);
	} else {
		const first = t[0];
		const last = t[t.length - 1];
		if ((first === "(" || first === "（") && (last === ")" || last === "）")) out = t.slice(1, -1);
	}
	const clean = out.trim();
	return clean || t;
}
