import { GROUP_MEMBER_LIMIT, type Settings } from '@tpc/shared';
import type { GameStore, GroupRecord } from '../store/types';
import { newPlayerId, newSecretId } from '../util/crypto';
import { log } from '../util/log';
import { fail, ok, type Result } from './types';

const nameKey = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Saved groups of friends. Groups used by live games are cached so a seat can be matched to a
 * member synchronously (e.g. when the host adds an offline seat); every change is written
 * through to the store in order.
 */
export class GroupService {
  private readonly cache = new Map<string, GroupRecord>();
  private readonly saveChains = new Map<string, Promise<void>>();

  constructor(
    private readonly store: GameStore,
    private readonly now: () => number,
  ) {}

  async create(name: string, settings: Settings): Promise<GroupRecord> {
    const now = this.now();
    const group: GroupRecord = {
      id: newSecretId(),
      name: name.trim(),
      settings,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    this.cache.set(group.id, group);
    await this.store.saveGroup(group);
    return group;
  }

  async load(id: string): Promise<GroupRecord | null> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const found = await this.store.findGroup(id);
    if (!found) return null;
    // Another load may have finished first; keep the one already cached.
    const current = this.cache.get(id) ?? found;
    this.cache.set(id, current);
    return current;
  }

  cached(id: string): GroupRecord | undefined {
    return this.cache.get(id);
  }

  async update(
    id: string,
    patch: { name?: string | undefined; settings?: Settings | undefined },
  ): Promise<GroupRecord | null> {
    const group = await this.load(id);
    if (!group) return null;
    if (patch.name !== undefined) group.name = patch.name.trim();
    if (patch.settings !== undefined) group.settings = patch.settings;
    group.updatedAt = this.now();
    await this.persist(group);
    return group;
  }

  /**
   * Which member a new seat is. An explicit `memberId` must exist and not be seated already;
   * otherwise a free member with the same name is reused, or a new member is added. Returns
   * null when the group is full (the seat then just isn't counted).
   */
  resolveMember(
    group: GroupRecord,
    input: { name: string; avatar: string; memberId?: string | undefined },
    taken: ReadonlySet<string>,
  ): Result<{ memberId: string | null; name: string }> {
    if (input.memberId !== undefined) {
      const m = group.members.find((x) => x.id === input.memberId);
      if (!m) return fail('INVALID_PAYLOAD', "That name isn't in this group.");
      if (taken.has(m.id)) return fail('FORBIDDEN', `${m.name} is already at this table.`);
      if (m.avatar !== input.avatar) {
        m.avatar = input.avatar;
        void this.persist(group);
      }
      return ok({ memberId: m.id, name: m.name });
    }
    const key = nameKey(input.name);
    const same = group.members.find((x) => nameKey(x.name) === key && !taken.has(x.id));
    if (same) return ok({ memberId: same.id, name: same.name });
    if (group.members.length >= GROUP_MEMBER_LIMIT) return ok({ memberId: null, name: input.name });
    const member = {
      id: newPlayerId(),
      name: input.name.trim(),
      avatar: input.avatar,
      joinedAt: this.now(),
    };
    group.members.push(member);
    group.updatedAt = this.now();
    void this.persist(group);
    return ok({ memberId: member.id, name: member.name });
  }

  /** Wait for pending writes (tests, shutdown). */
  async flush(): Promise<void> {
    await Promise.all([...this.saveChains.values()]);
  }

  private persist(group: GroupRecord): Promise<void> {
    const snapshot = structuredClone(group);
    const prev = this.saveChains.get(group.id) ?? Promise.resolve();
    const next = prev
      .then(() => this.store.saveGroup(snapshot))
      .catch((e: unknown) => log.error(`saving group failed`, e));
    this.saveChains.set(group.id, next);
    void next.finally(() => {
      if (this.saveChains.get(group.id) === next) this.saveChains.delete(group.id);
    });
    return next;
  }
}
