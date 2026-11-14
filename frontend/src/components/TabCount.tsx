export default function TabCount({ count }: { count?: number }) {
  return count !== undefined && count > 0 ? <> <span className="teacher-tab-count">{count}</span></> : null;
}
