import assert from "node:assert/strict";
import { test } from "node:test";

import {
	applyProjectedSamplers,
	projectSamplers,
	resolveSamplerProfile,
} from "../src/samplers.ts";

const full = {
	temperature: 1,
	top_p: 0.98,
	top_k: 64,
	frequency_penalty: 0,
	presence_penalty: 0,
	repetition_penalty: 1,
};

test("默认自定义中转（cpa）：只投影核心 4 键，不带 top_k / repetition_penalty", () => {
	assert.equal(resolveSamplerProfile({ provider: "cpa", modelId: "kimi-k2" }), "openai-core");
	const out = projectSamplers(full, { provider: "cpa", modelId: "longcat-2.0", baseUrl: "https://codex.example/v1" });
	assert.deepEqual(out, {
		temperature: 1,
		top_p: 0.98,
		frequency_penalty: 0,
		presence_penalty: 0,
	});
	assert.ok(!("top_k" in out));
	assert.ok(!("repetition_penalty" in out));
});

test("OpenRouter：扩展键放行", () => {
	assert.equal(resolveSamplerProfile({ provider: "openrouter" }), "openrouter-ext");
	const out = projectSamplers(full, { provider: "openrouter", modelId: "meta/llama" });
	assert.equal(out.top_k, 64);
	assert.equal(out.repetition_penalty, 1);
});

test("Anthropic api：带 top_k", () => {
	assert.equal(resolveSamplerProfile({ api: "anthropic-messages" }), "anthropic");
	const out = projectSamplers(full, { api: "anthropic-messages", modelId: "claude-sonnet" });
	assert.equal(out.top_k, 64);
	assert.ok(!("repetition_penalty" in out));
});

test("DeepSeek：核心键；top_p=0 抬到 EPSILON", () => {
	assert.equal(resolveSamplerProfile({ provider: "deepseek" }), "openai-core");
	const out = projectSamplers({ ...full, top_p: 0 }, { provider: "deepseek", modelId: "deepseek-chat" });
	assert.ok(out.top_p && out.top_p > 0);
	assert.ok(!("top_k" in out));
});

test("kimi-k2.5 / o1：profile=none，不发采样", () => {
	assert.equal(resolveSamplerProfile({ provider: "moonshotai", modelId: "kimi-k2.5" }), "none");
	assert.equal(resolveSamplerProfile({ provider: "openai", modelId: "o3-mini" }), "none");
	assert.deepEqual(projectSamplers(full, { provider: "moonshotai", modelId: "kimi-k2.5" }), {});
	assert.deepEqual(projectSamplers(full, { provider: "openai", modelId: "o1" }), {});
});

test("top_k=0 视为未启用，不写入", () => {
	const out = projectSamplers(
		{ temperature: 0.8, top_k: 0 },
		{ provider: "openrouter" },
	);
	assert.equal(out.temperature, 0.8);
	assert.ok(!("top_k" in out));
});

test("includeKeys 可在自定义中转上显式放行 top_k", () => {
	const out = projectSamplers(full, {
		provider: "cpa",
		modelId: "anything",
		includeKeys: ["top_k"],
	});
	assert.equal(out.top_k, 64);
	assert.ok(!("repetition_penalty" in out));
});

test("excludeKeys 可强制去掉 temperature", () => {
	const out = projectSamplers(full, {
		provider: "openrouter",
		excludeKeys: ["temperature", "top_k"],
	});
	assert.ok(!("temperature" in out));
	assert.ok(!("top_k" in out));
	assert.equal(out.top_p, 0.98);
});

test("applyProjectedSamplers：去掉盲塞的扩展键，写入投影结果", () => {
	const payload = {
		model: "x",
		messages: [],
		temperature: 0.5,
		top_k: 999,
		repetition_penalty: 1.2,
	};
	const next = applyProjectedSamplers(payload, full, { provider: "cpa", modelId: "kimi-k3" });
	assert.equal(next.temperature, 1); // 预设覆盖
	assert.equal(next.top_p, 0.98);
	assert.ok(!("top_k" in next), "自定义中转不应再带 top_k");
	assert.ok(!("repetition_penalty" in next));
	assert.equal(next.model, "x");
});

test("预设值仍完整：project 不修改入参", () => {
	const src = { ...full };
	projectSamplers(src, { provider: "cpa" });
	assert.deepEqual(src, full);
});

test("LongCat：temperature>1 钳到 1（官方 0~1，否则秒 400）", () => {
	const out = projectSamplers(
		{ temperature: 1.27, top_p: 1, frequency_penalty: 0, presence_penalty: 0, top_k: 0 },
		{ provider: "longcat", modelId: "LongCat-2.0", baseUrl: "https://api.longcat.chat/openai/v1" },
	);
	assert.equal(out.temperature, 1);
	assert.equal(out.top_p, 1);
	assert.ok(!("top_k" in out));
	// baseUrl 启发式同样识别
	const byUrl = projectSamplers(
		{ temperature: 1.5 },
		{ provider: "custom", baseUrl: "https://api.longcat.chat/openai/v1" },
	);
	assert.equal(byUrl.temperature, 1);
});
