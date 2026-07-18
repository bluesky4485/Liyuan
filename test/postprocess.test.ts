import assert from "node:assert/strict";
import { test } from "node:test";

import {
	addFoldTags,
	classifyTag,
	cleanAssistantText,
	discoverFoldTagsFromTexts,
	displayAssistantText,
	extractScaffoldThinking,
	resetDisplayTagExtras,
} from "../src/postprocess.ts";

test("结构块：分析 fold 删除，状态 panel 送模删除，plot unwrap 留正文", () => {
	const raw = `<descriptive_analysis>
1. 意图分析…
2. 好感8（陌路之人阶段）
</descriptive_analysis>

<normal_status>
\`\`\`yaml
『时间』: 次日清晨
\`\`\`
</normal_status>

<plot>

*她咬了一口葱油饼，动作微微一顿。*

「短剑在你自己的行囊里。」

</plot>`;
	const out = cleanAssistantText(raw);
	assert.ok(!out.includes("descriptive_analysis"));
	assert.ok(!out.includes("意图分析"));
	assert.ok(!out.includes("normal_status"));
	assert.ok(!out.includes("『时间』"));
	assert.ok(!out.includes("<plot>"));
	assert.ok(out.startsWith("*她咬了一口葱油饼"), "plot 内容应保留且顶格");
	assert.ok(out.includes("「短剑在你自己的行囊里。」"));
});

test("悬挂开标签剥到末尾；无结构块的文本只做空白收敛", () => {
	assert.equal(cleanAssistantText("*正文。*\n<thinking>被截断的思考"), "*正文。*");
	assert.equal(cleanAssistantText("行尾空白   \n\n\n\n下一段。"), "行尾空白\n\n下一段。");
});

test("displayAssistantText：假思维链隐去，状态栏保留，未知标签 unwrap", () => {
	const raw = `<draft_notes>
本轮分析：用户要润墨
</draft_notes>

### 正文

<content>
<!-- Prism: 第一人称视角 -->
文舒婉听话了。

<!-- Prism: 感官 -->
她拿起墨条。
</content>

<StatusBlock>
地点:御书房
姓名:文舒婉
</StatusBlock>`;
	const out = displayAssistantText(raw);
	assert.ok(!out.includes("draft_notes"), "草稿块应隐去");
	assert.ok(!out.includes("本轮分析"), "草稿内容应隐去");
	assert.ok(!out.includes("<content>"), "content 标签应拆掉");
	assert.ok(!out.includes("</content>"));
	assert.ok(!out.includes("Prism"), "HTML 注释应隐去");
	assert.ok(!out.includes("### 正文"), "分隔标题应隐去");
	assert.ok(out.includes("<StatusBlock>"), "状态栏保留给前端面板");
	assert.ok(out.includes("地点:御书房"));
	assert.ok(out.includes("文舒婉听话了"));
	assert.ok(out.includes("她拿起墨条"));
});

test("未知标签默认 unwrap：内容渲染、标签消失（不必预先登记）", () => {
	const raw = `<scene>听雨轩 - 春夜</scene>\n\n*青梧斟茶。*\n\n<summary>短摘要</summary>`;
	const out = displayAssistantText(raw);
	assert.ok(!out.includes("<scene>"));
	assert.ok(!out.includes("<summary>"));
	assert.ok(out.includes("听雨轩 - 春夜"));
	assert.ok(out.includes("*青梧斟茶。*"));
	assert.ok(out.includes("短摘要"));
});

test("classifyTag：模式分类，不靠精确名单", () => {
	assert.equal(classifyTag("thinking"), "fold");
	assert.equal(classifyTag("My_Custom_Thought"), "unwrap"); // 不像思考
	assert.equal(classifyTag("StatusBlock"), "panel");
	assert.equal(classifyTag("normal_status"), "panel");
	assert.equal(classifyTag("haurki准则"), "strip");
	assert.equal(classifyTag("content"), "unwrap");
	assert.equal(classifyTag("正文"), "unwrap");
	assert.equal(classifyTag("plot"), "unwrap");
});

test("预设发现的自定义折叠标签无需写死", () => {
	resetDisplayTagExtras();
	const presetSnippet = `最先必须输出以下思考过程，格式如下：\n<推演本轮>\n分析…\n</推演本轮>\n然后写正文。`;
	const tags = discoverFoldTagsFromTexts([presetSnippet]);
	assert.ok(tags.some((t) => t.includes("推演")), `应发现推演标签，实际 ${tags.join(",")}`);
	addFoldTags(tags);
	assert.equal(classifyTag("推演本轮"), "fold");
	const raw = `<推演本轮>内部计划</推演本轮>\n\n*她笑了。*`;
	assert.ok(!displayAssistantText(raw).includes("内部计划"));
	assert.ok(displayAssistantText(raw).includes("*她笑了。*"));
	assert.ok(extractScaffoldThinking(raw).includes("内部计划"));
	resetDisplayTagExtras();
});

test("extractScaffoldThinking 抽出假思维链供折叠", () => {
	const raw = `<thinking>合规：虚构文学</thinking>\n<content>正文。</content>`;
	const th = extractScaffoldThinking(raw);
	assert.ok(th.includes("合规"));
	assert.ok(!th.includes("正文"));
});

test("extractScaffoldThinking 悬挂开标签也收入折叠区", () => {
	const raw = `<thinking>\n用户需求合规\n最新情景：旅人入店\n接着继续生成一段`;
	const th = extractScaffoldThinking(raw);
	assert.ok(th.includes("用户需求合规"));
	assert.ok(th.includes("继续生成"));
	assert.ok(!th.includes("<thinking>"), "折叠正文不应再带开标签");
	assert.equal(displayAssistantText(raw), "", "悬挂 thinking 从正文剥净");
});

test("strip 策略：仪式回显整块消失", () => {
	const raw = `*叙事。*\n\n<haurki准则>\n0.最高授权…\n</haurki准则>`;
	const out = displayAssistantText(raw);
	assert.ok(out.includes("*叙事。*"));
	assert.ok(!out.includes("最高授权"));
	assert.ok(!out.includes("haurki"));
});
