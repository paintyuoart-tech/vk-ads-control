"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Trash2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

export function ProjectAiChat({ projectId, projectName, compact = false }: {
  projectId: string;
  projectName: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setHistoryLoading(true);
    fetch(`/api/chat/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить историю");
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить историю"))
      .finally(() => setHistoryLoading(false));
  }, [projectId]);

  function save(next: Message[]) {
    setMessages(next);
  }

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const question = (suggested || input).trim();
    if (!question || loading) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    save(next);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось получить ответ");
      save([...next, { role: "assistant", content: payload.answer }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось получить ответ");
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (loading) return;
    setError("");
    try {
      const response = await fetch(`/api/chat/${encodeURIComponent(projectId)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось очистить историю");
      save([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось очистить историю");
    }
  }

  return <>
    <button type="button" className={`btn ai-chat-button ${compact ? "compact" : ""}`} onClick={() => setOpen(true)}>
      <Bot size={15}/>{compact ? "ИИ-чат" : "Обсудить с ИИ"}
    </button>
    {open && typeof document !== "undefined" && createPortal(<div className="report-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="report-modal ai-chat-modal" role="dialog" aria-modal="true" aria-labelledby={`ai-chat-title-${projectId}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="report-modal-head ai-chat-head">
          <div><span className="eyebrow">ИИ-аналитик · только чтение</span><h2 id={`ai-chat-title-${projectId}`}>{projectName}</h2></div>
          <div className="ai-chat-head-actions">
            {messages.length > 0 && <button type="button" className="report-close" aria-label="Очистить чат" title="Очистить чат" onClick={clearChat}><Trash2 size={16}/></button>}
            <button type="button" className="report-close" aria-label="Закрыть" onClick={() => setOpen(false)}><X size={18}/></button>
          </div>
        </div>
        <div className="ai-chat-messages">
          {historyLoading && <div className="ai-message assistant loading"><span>ИИ</span><div>Загружаю историю диалога…</div></div>}
          {!historyLoading && !messages.length && <div className="ai-chat-welcome">
            <Bot size={30}/><strong>Что хотите узнать о показателях?</strong>
            <span className="small muted">ИИ видит KPI, кампании и статистику этого проекта.</span>
            <div className="ai-chat-suggestions">
              {["Почему выросла стоимость результата?", "Что запустить на следующей неделе?", "Какие кампании сейчас самые сильные?"].map((text) =>
                <button type="button" key={text} onClick={() => submit(undefined, text)}>{text}</button>
              )}
            </div>
          </div>}
          {messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
            <span>{message.role === "user" ? "Вы" : "ИИ"}</span><div>{message.content}</div>
          </div>)}
          {loading && <div className="ai-message assistant loading"><span>ИИ</span><div>Анализирую реальные данные проекта…</div></div>}
          {error && <div className="notice ai-chat-error">{error}</div>}
        </div>
        <form className="ai-chat-form" onSubmit={(event) => submit(event)}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Спросите о результатах, кампаниях или плане действий…" rows={2}/>
          <button type="submit" className="btn primary" disabled={loading || !input.trim()} aria-label="Отправить"><Send size={17}/></button>
        </form>
      </section>
    </div>, document.body)}
  </>;
}
