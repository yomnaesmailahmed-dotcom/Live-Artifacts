// Realtime Presence on a private channel ("project:<uuid>", "workspace", …).
// Access is enforced by the RLS policies on realtime.messages (private.can_use_topic).

export async function joinPresence(sb, topic, meta, onSync) {
  await sb.realtime.setAuth();
  const channel = sb.channel(topic, { config: { private: true, presence: { key: meta.user_id } } });
  let current = meta;
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    // one entry per user (the most recent tab wins)
    const people = Object.values(state).map((metas) => metas[metas.length - 1]).filter(Boolean);
    onSync(people);
  });
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') await channel.track(current);
  });
  return {
    update(patch) { current = { ...current, ...patch }; return channel.track(current); },
    leave() { return sb.removeChannel(channel); },
  };
}
