"use client";

import Image from "next/image";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { ClubChatMessage } from "@/lib/supabase/types";
import type { ClubChatModerationMember } from "@/lib/supabase/types";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { clubChatRules } from "@/lib/chat-policy";
import {
  acceptClubChatRules,
  deleteClubMessage,
  postClubMessage,
  setClubChatRestriction,
} from "../actions";

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function applyCurrentUserName(messages: ClubChatMessage[], currentUser: { id: string; name: string; avatarUrl: string | null }) {
  return messages.map(message => message.author_id === currentUser.id && message.author_name === "Club member"
    ? { ...message, author_name: currentUser.name, author_avatar_url: message.author_avatar_url ?? currentUser.avatarUrl }
    : message);
}

export default function ClubChat({
  clubId,
  slug,
  messages,
  currentUser,
  moderationReady,
  agreed,
  restricted,
  restrictionReason,
  canModerate,
  moderationMembers,
}: {
  clubId: string;
  slug: string;
  messages: ClubChatMessage[];
  currentUser: { id: string; name: string; avatarUrl: string | null };
  moderationReady: boolean;
  agreed: boolean;
  restricted: boolean;
  restrictionReason: string | null;
  canModerate: boolean;
  moderationMembers: ClubChatModerationMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [liveMessages, setLiveMessages] = useState(() => applyCurrentUserName(messages, currentUser));
  const [visibleCount, setVisibleCount] = useState(25);
  const refreshMessages = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase.rpc("get_club_chat_messages", { p_club_id: clubId, p_limit: 200 });
    if (data) setLiveMessages(applyCurrentUserName(data, currentUser));
  }, [clubId, currentUser]);
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof postClubMessage>>, formData: FormData) => {
    const body = String(formData.get("body") ?? "").trim();
    const temporaryId = `pending-${Date.now()}`;
    if (body) {
      setLiveMessages((current) => [...current, {
        id: temporaryId,
        club_id: clubId,
        author_id: currentUser.id,
        author_name: currentUser.name,
        author_avatar_url: currentUser.avatarUrl,
        body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        can_delete: false,
      }]);
    }
    const result = await postClubMessage(previous, formData);
    if (!result?.ok) setLiveMessages((current) => current.filter((message) => message.id !== temporaryId));
    else await refreshMessages();
    return result;
  }, null);
  const visibleMessages = useMemo(() => liveMessages.slice(-visibleCount), [liveMessages, visibleCount]);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [liveMessages.length]);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`club-chat:${clubId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_messages", filter: `club_id=eq.${clubId}` },
        () => void refreshMessages(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clubId, refreshMessages]);

  return (
    <section className="theme-fixed-dark mt-12 overflow-hidden rounded-[18px] border border-[#97b4de]/40 bg-[#080d20]" aria-labelledby="club-chat-title">
      <header className="border-b border-white/10 px-5 py-4 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Members only</p>
        <h2 id="club-chat-title" className="mt-1 font-display text-2xl font-semibold uppercase text-cream">Club chat</h2>
        <p className="mt-1 text-sm text-cream/60">A private conversation for approved members and Club leadership.</p>
      </header>

      <div ref={listRef} className="max-h-[30rem] space-y-4 overflow-y-auto px-5 py-5 sm:px-6" aria-live="polite">
        {liveMessages.length > visibleCount ? <div className="text-center"><button type="button" onClick={() => setVisibleCount((count) => count + 25)} className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-cream/70 hover:bg-white/5 hover:text-cream">Load 25 older messages</button></div> : null}
        {visibleMessages.length ? visibleMessages.map((message) => (
          <article key={message.id} className="flex gap-3">
            {message.author_avatar_url ? (
              <Image src={message.author_avatar_url} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream font-bold text-navy">
                {message.author_name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1 rounded-[14px] bg-white/5 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-cream">{message.author_name}</p>
                <time dateTime={message.created_at} className="text-[11px] text-cream/45">{messageTime(message.created_at)}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-cream/80">{message.body}</p>
              {message.can_delete ? (
                <form action={deleteClubMessage} className="mt-2 text-right">
                  <input type="hidden" name="club_id" value={clubId} />
                  <input type="hidden" name="message_id" value={message.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <button className="text-xs font-semibold text-cream/50 hover:text-[#f78660]">Delete</button>
                </form>
              ) : null}
            </div>
          </article>
        )) : (
          <p className="py-8 text-center text-sm text-cream/55">No messages yet. Start the Club conversation.</p>
        )}
      </div>

      {canModerate && moderationReady ? (
        <details className="border-t border-white/10 px-5 py-4 sm:px-6">
          <summary className="cursor-pointer text-sm font-bold text-powder">Manage member chat access</summary>
          <p className="mt-2 text-xs leading-5 text-cream/55">Admins and this Club&apos;s Advisors may pause or restore posting access. Every decision records the member, moderator, reason, and time.</p>
          <div className="mt-4 space-y-3">
            {moderationMembers.length ? moderationMembers.map((member) => (
              <article key={member.profile_id} className="rounded-[14px] border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold text-cream">{member.display_name}</p><p className={`mt-1 text-xs font-bold uppercase ${member.restricted ? "text-[#f78660]" : "text-[#9ed6a8]"}`}>{member.restricted ? "Posting paused" : "Can post"}</p></div>
                  {member.restricted_at ? <time dateTime={member.restricted_at} className="text-[11px] text-cream/40">Since {messageTime(member.restricted_at)}</time> : null}
                </div>
                {member.restriction_reason ? <p className="mt-2 text-xs leading-5 text-cream/65">Recorded reason: {member.restriction_reason}</p> : null}
                <ActionFeedbackForm action={setClubChatRestriction} className="mt-3 grid gap-2">
                  <input type="hidden" name="club_id" value={clubId} />
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="profile_id" value={member.profile_id} />
                  {member.restricted ? (
                    <><input type="hidden" name="operation" value="restore" /><label className="text-xs text-cream/65">Restoration note <span className="text-cream/35">(optional)</span><input name="reason" maxLength={500} placeholder="Why access is being restored" className="mt-1 min-h-10 w-full rounded-[10px] border border-white/15 bg-[#080d20] px-3 text-sm text-cream" /></label><button className="justify-self-start rounded-full border border-[#9ed6a8]/50 px-4 py-2 text-xs font-bold text-[#9ed6a8]">Restore posting access</button></>
                  ) : (
                    <><input type="hidden" name="operation" value="restrict" /><label className="text-xs text-cream/65">Reason for restriction<input name="reason" required minLength={3} maxLength={500} placeholder="Describe the rule violation clearly" className="mt-1 min-h-10 w-full rounded-[10px] border border-white/15 bg-[#080d20] px-3 text-sm text-cream" /></label><button className="justify-self-start rounded-full border border-[#f78660]/60 px-4 py-2 text-xs font-bold text-[#f78660]">Pause posting access</button></>
                  )}
                </ActionFeedbackForm>
              </article>
            )) : <p className="text-sm text-cream/50">No active members are available for moderation.</p>}
          </div>
        </details>
      ) : null}

      {!moderationReady ? (
        <div className="border-t border-white/10 p-5"><p role="alert" className="rounded-[14px] border border-[#f78660]/40 bg-[#f78660]/10 p-4 text-sm leading-6 text-cream">Chat safety controls are awaiting database setup. An Admin must apply <code>supabase/schema.sql</code> before anyone can post.</p></div>
      ) : !agreed ? (
        <div className="border-t border-white/10 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-powder">Before your first message</p>
          <h3 className="mt-1 text-xl font-bold text-cream">Agree to the Club chat rules</h3>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-cream/75">{clubChatRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
          <p className="mt-4 rounded-[12px] border border-[#f78660]/30 bg-[#f78660]/10 p-3 text-xs leading-5 text-cream/75">Violations may result in messages being removed and posting access being paused. Admins and the Club Advisor can later restore access. All moderation decisions are recorded for accountability.</p>
          <ActionFeedbackForm action={acceptClubChatRules} className="mt-4 grid gap-3">
            <input type="hidden" name="club_id" value={clubId} />
            <input type="hidden" name="slug" value={slug} />
            <label className="flex items-start gap-2 text-sm leading-6 text-cream"><input type="checkbox" name="accept_rules" value="yes" required className="mt-1" /><span>I have read these rules and agree to follow them.</span></label>
            <button className="justify-self-start rounded-full bg-cream px-5 py-2 text-sm font-bold text-black">Accept and enter chat</button>
          </ActionFeedbackForm>
        </div>
      ) : restricted ? (
        <div className="border-t border-white/10 p-5"><div role="alert" className="rounded-[14px] border border-[#f78660]/40 bg-[#f78660]/10 p-4"><p className="font-bold text-cream">Your posting access is paused</p><p className="mt-1 text-sm leading-6 text-cream/70">You can still read the conversation. Contact the Club Advisor if you need clarification or believe access should be restored.</p>{restrictionReason ? <p className="mt-2 text-xs text-cream/60">Recorded reason: {restrictionReason}</p> : null}</div></div>
      ) : <form ref={formRef} action={action} className="border-t border-white/10 p-4 sm:p-5">
        <input type="hidden" name="club_id" value={clubId} />
        <input type="hidden" name="slug" value={slug} />
        <label htmlFor="club-chat-message" className="sr-only">Message the Club</label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            id="club-chat-message"
            name="body"
            required
            maxLength={2000}
            rows={2}
            placeholder="Message your Club…"
            className="min-h-12 flex-1 resize-y rounded-[14px] border border-white/15 bg-white/5 px-4 py-3 text-sm text-cream outline-none placeholder:text-cream/35 focus:border-powder"
          />
          <button disabled={pending} className="h-11 rounded-full bg-cream px-6 text-sm font-bold text-black disabled:cursor-wait disabled:opacity-60">
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3"><p role="status" className={`text-xs ${state?.ok ? "text-powder" : "text-[#f78660]"}`}>{state?.message ?? "New messages appear automatically."}</p><span className="text-[11px] text-cream/35">Showing {visibleMessages.length} of {liveMessages.length}</span></div>
      </form>}
    </section>
  );
}
