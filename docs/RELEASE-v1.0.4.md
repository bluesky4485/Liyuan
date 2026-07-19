# Liyuan Agent 1.0.4

## 本版要点

- **Kimi K3 / k2.6 / k2.7 固定采样**：官方要求勿传 `temperature` / `top_p` / 惩罚项；开启预设后按模型 `profile=none` 全剥，避免渠道拒调（含 opencode 等中转上的 `kimi-k3`）。
- **停止更干净**：工具轮 / 选择卡后 abort 不再误开下一轮 LLM；清空 steer/follow-up 队列；前端停止后忽略迟到 delta。
- **中断留痕**：`stopReason=aborted` 的半截正文 / 仅思维链 / 夹 toolCall 均可上屏并标「未完成」；`resync` 后不消失，便于继续。
- **过程条 RP 化**：工具前台侧旁白规范进 harness；工具步骤显示人话摘要（非 JSON）；标签与样式更像导演笔记。
- **过程 UI**：旁白加重、步骤 chip、tool 状态「已办完 / 未办成」。

## 安装包

| 平台 | 文件 |
|------|------|
| Windows | `Liyuan-1.0.4-windows.zip` |
| Linux | `Liyuan-1.0.4-linux.zip` |
| macOS | `Liyuan-1.0.4-macos.zip` |
| 校验 | `SHA256SUMS.txt` |

| **Docker** | 见仓库 `docker-compose.yml` | `docker compose up -d --build` |

## 快速开始

见各包内 `RELEASE.txt` / `start.bat` · `start.sh` · `start.command`。需要 Node.js **≥ 22**。

## 说明

- 不含个人 API Key、私有角色卡或运行时会话数据。
- 许可证：PolyForm Noncommercial 1.0.0（个人/非商业）。
