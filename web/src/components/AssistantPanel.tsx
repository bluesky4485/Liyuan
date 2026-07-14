/**
 * 助手面板（右栏）：与剧情会话并行的独立助手对话（2026-07-14 职责拆分）。
 *
 * 数据面全部走 WS（assistant_* 帧，App 持状态、本组件纯渲染 + 回调）；
 * 只有模型清单走 REST（/api/models，选择器数据）。
 * 过程呈现学 codex（2026-07-14 用户定调）：进行中的一轮每一步实时追加、全程平铺可见；
 * 最终回复落定后，之前的所有步骤一次性收进**一个**「过程」折叠，回复本体平铺不折。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, type ModelsResponse } from "../api.ts";
import type { AssistantModelInfo, AssistantMsg, WireActivity } from "../wire.ts";
import { LiveSteps, RichContent, ThinkingBlock, ZoomImg } from "./Messages.tsx";
import { IconPlus, IconSend, IconStop } from "./icons.tsx";

/** 助手交付的媒体（show_media）：图片走 lightbox，音视频走原生播放器 */
function AsstMedia({ media }: { media: NonNullable<AssistantMsg["media"]> }) {
	if (media.kind === "image") {
		return (
			<div className="asst-media">
				<ZoomImg src={media.src} alt={media.caption ?? ""} title={media.caption} />
			</div>
		);
	}
	if (media.kind === "audio") {
		return (
			<div className="asst-media">
				<audio src={media.src} controls />
			</div>
		);
	}
	return (
		<div className="asst-media">
			{/* eslint-disable-next-line jsx-a11y/media-has-caption -- 用户素材，无字幕轨 */}
			<video src={media.src} controls />
		</div>
	);
}

export interface AssistantPanelProps {
	/** null=尚未同步（连接前） */
	msgs: AssistantMsg[] | null;
	busy: boolean;
	streamText: string;
	streamThinking: string;
	thinkingLive: boolean;
	/** 进行中的工具（tool_start 名称），无则 null */
	toolNote: string | null;
	/** 本轮已发生、尚未附着到消息的过程步骤（实时清单） */
	liveActs: WireActivity[];
	model: AssistantModelInfo | null;
	/** true=跟随剧情模型 */
	follow: boolean;
	onSend(text: string): void;
	onAbort(): void;
	onNew(): void;
	/** null=回到跟随剧情模型 */
	onPickModel(sel: { provider: string; id: string } | null): void;
}

/** 同一轮的连续助手消息：前 n-1 条是中间步骤，最后一条是回复 */
type Block =
	| { kind: "user"; msg: AssistantMsg }
	| { kind: "reply"; steps: AssistantMsg[]; final: AssistantMsg };

function toBlocks(msgs: AssistantMsg[]): Block[] {
	const out: Block[] = [];
	let run: AssistantMsg[] = [];
	const flush = () => {
		if (run.length === 0) return;
		out.push({ kind: "reply", steps: run.slice(0, -1), final: run[run.length - 1] });
		run = [];
	};
	for (const m of msgs) {
		if (m.role === "user") {
			flush();
			out.push({ kind: "user", msg: m });
		} else {
			run.push(m);
		}
	}
	flush();
	return out;
}

/**
 * 消息的时序展开：附着在某条消息上的 activities 发生在该消息正文**之前**
 * （它们是上一条消息工具调用的执行记录），故渲染顺序=步骤清单在上、正文在下。
 */
function StepView({ m }: { m: AssistantMsg }) {
	return (
		<div className="bs-step">
			{m.activities && m.activities.length > 0 && <LiveSteps activities={m.activities} />}
			{m.thinking && <ThinkingBlock text={m.thinking} />}
			{m.text && <RichContent text={m.text} />}
			{m.media && <AsstMedia media={m.media} />}
		</div>
	);
}

/** 已完结的一轮：全部过程收进一个折叠，最终回复平铺在外（codex 式过程-成品分离） */
function ReplyBlock({ steps, final }: { steps: AssistantMsg[]; final: AssistantMsg }) {
	const toolCalls = [...steps, final].reduce(
		(n, m) => n + (m.activities?.filter((a) => a.kind === "tool_start").length ?? 0),
		0,
	);
	const hasProcess = steps.length > 0 || (final.activities?.length ?? 0) > 0;
	return (
		<div className="asst-reply">
			{hasProcess && (
				<details className="turn-activity">
					<summary>
						过程
						{steps.length > 0 && ` · 中间步骤 ×${steps.length}`}
						{toolCalls > 0 && ` · 工具调用 ×${toolCalls}`}
					</summary>
					{steps.map((m, i) => (
						<StepView key={i} m={m} />
					))}
					{final.activities && final.activities.length > 0 && <LiveSteps activities={final.activities} />}
				</details>
			)}
			{final.thinking && <ThinkingBlock text={final.thinking} />}
			{final.text && <RichContent text={final.text} />}
			{final.media && <AsstMedia media={final.media} />}
		</div>
	);
}

export function AssistantPanel({
	msgs,
	busy,
	streamText,
	streamThinking,
	thinkingLive,
	toolNote,
	liveActs,
	model,
	follow,
	onSend,
	onAbort,
	onNew,
	onPickModel,
}: AssistantPanelProps) {
	const [input, setInput] = useState("");
	const [models, setModels] = useState<ModelsResponse | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const stickRef = useRef(true);

	// 模型清单：打开面板拉一次（选择器数据；失败静默，选择器只剩「跟随」）
	useEffect(() => {
		let alive = true;
		apiGet<ModelsResponse>("/api/models")
			.then((r) => {
				if (alive) setModels(r);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

	// 贴底跟随：用户没有主动上翻时，新内容到达自动滚到底
	useEffect(() => {
		const el = listRef.current;
		if (el && stickRef.current) el.scrollTop = el.scrollHeight;
	}, [msgs, streamText, streamThinking, liveActs, busy]);

	const blocks = useMemo(() => toBlocks(msgs ?? []), [msgs]);
	// busy 时末尾的回复串属于「进行中的一轮」：整轮平铺直播，收笔后才折叠
	const liveRun = busy && blocks.length > 0 && blocks[blocks.length - 1].kind === "reply"
		? (blocks[blocks.length - 1] as Extract<Block, { kind: "reply" }>)
		: null;
	const doneBlocks = liveRun ? blocks.slice(0, -1) : blocks;

	const send = () => {
		const t = input.trim();
		if (!t || busy) return;
		setInput("");
		stickRef.current = true;
		onSend(t);
	};

	const groups = useMemo(() => {
		const map = new Map<string, Array<{ value: string; label: string }>>();
		for (const m of models?.models ?? []) {
			const arr = map.get(m.providerName) ?? [];
			arr.push({ value: `${m.provider} ${m.id}`, label: m.name || m.id });
			map.set(m.providerName, arr);
		}
		return [...map.entries()];
	}, [models]);

	return (
		<div className="asst-panel">
			<div className="asst-toolbar">
				<label className="asst-model">
					<select
						value={follow ? "" : model ? `${model.provider} ${model.id}` : ""}
						onChange={(e) => {
							const v = e.target.value;
							if (!v) {
								onPickModel(null);
								return;
							}
							const [provider, id] = v.split(" ");
							if (provider && id) onPickModel({ provider, id });
						}}
						title="助手使用的模型（独立于剧情模型）"
						aria-label="助手模型"
					>
						<option value="">跟随对话模型{follow && model ? `（${model.name}）` : ""}</option>
						{groups.map(([providerName, items]) => (
							<optgroup key={providerName} label={providerName}>
								{items.map((it) => (
									<option key={it.value} value={it.value}>
										{it.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</label>
				<button
					type="button"
					className="icon-btn"
					onClick={onNew}
					disabled={busy}
					title="新对话（当前助手对话归档，不影响剧情）"
					aria-label="助手新对话"
				>
					<IconPlus size={16} />
				</button>
			</div>
			<div className="asst-hint">
				剧情尺度较大时，建议为助手单独选择宽容一些的模型（拒答与剧情模型解耦）。
			</div>

			<div
				className="asst-list"
				ref={listRef}
				onScroll={() => {
					const el = listRef.current;
					if (!el) return;
					stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
				}}
			>
				{msgs === null && <div className="sp-empty">连接后台中…</div>}
				{msgs !== null && blocks.length === 0 && !busy && (
					<div className="sp-empty">
						这里是系统助手：诊断回复质量、调配置与预设、维护记忆、接外部服务，都可以直接吩咐。
						它能看到剧情记录，但绝不代写剧情。在主输入框用 // 开头说话也会转到这里。
					</div>
				)}
				{doneBlocks.map((b, i) =>
					b.kind === "user" ? (
						<div key={i} className="asst-user">
							<RichContent text={b.msg.text} />
						</div>
					) : (
						<ReplyBlock key={i} steps={b.steps} final={b.final} />
					),
				)}
				{busy && (
					<div className="asst-reply asst-live">
						{/* 进行中的一轮：已完成步骤 + 未附着活动 + 当前流式，全部平铺（收笔后统一折叠） */}
						{liveRun && [...liveRun.steps, liveRun.final].map((m, i) => <StepView key={i} m={m} />)}
						{liveActs.length > 0 && <LiveSteps activities={liveActs} />}
						{(streamThinking || thinkingLive) && <ThinkingBlock text={streamThinking} live={thinkingLive} />}
						{streamText ? <RichContent text={streamText} /> : null}
						<div className="asst-working">{toolNote ?? "思考中…"}</div>
					</div>
				)}
			</div>

			<div className="asst-composer">
				<textarea
					value={input}
					rows={1}
					placeholder="吩咐助手…（Enter 发送，Shift+Enter 换行）"
					onChange={(e) => {
						setInput(e.target.value);
						e.target.style.height = "auto";
						e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
							e.preventDefault();
							send();
						}
					}}
				/>
				{busy ? (
					<button className="btn btn-stop asst-send" onClick={onAbort} title="停止" aria-label="停止助手生成">
						<IconStop size={16} />
					</button>
				) : (
					<button
						className="btn btn-send asst-send"
						onClick={send}
						disabled={!input.trim()}
						title="发送给助手"
						aria-label="发送给助手"
					>
						<IconSend size={15} />
					</button>
				)}
			</div>
		</div>
	);
}
