// RuleGroupItem.tsx
import { Toggle, showToast } from '@components';
import { deleteGroup, deleteRule, renameGroup, rules, toggleGroup, updateRule } from '@store';
import { useRef, useState } from 'preact/hooks';
import styles from './RuleGroupItem.module.scss'; // New SCSS import

type RuleGroupItemProps = {
  group: { id: string; name: string; enabled: boolean };
  children: any;
};

export function RuleGroupItem({ group, children }: RuleGroupItemProps) {
  const [isEditing, setIsEditing] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const renameFormId = `rename-form-${group.id}`;
  const deleteFormId = `delete-form-${group.id}`;

  // ── Rename Logic using FormData ─────────────────────────────────────────────
  const handleSave = async (e: SubmitEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const newName = formData.get('groupName')?.toString().trim();

    if (newName && newName !== group.name) {
      await renameGroup(group.id, newName);
      showToast('🏷️ Group renamed');
    }
    setIsEditing(false);
  };

  // ── Delete Logic ────────────────────────────────────────────────────────────
  const confirmDelete = async (e: SubmitEvent) => {
    e.preventDefault(); // Prevents dialog form from reloading page

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const deleteRulesChecked = formData.get('deleteRules') === 'on';

    if (deleteRulesChecked) {
      const groupRules = rules.value.filter((r) => r.groupId === group.id);
      for (const rule of groupRules) {
        await deleteRule(rule.id);
      }
    }

    await deleteGroup(group.id);
    dialogRef.current?.close();
    showToast('🗑️ Group deleted');
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const startEditing = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
  };

  const cancelEditing = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(false);
  };

  const closeDialog = () => dialogRef.current?.close();

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add(styles.dragOver);
  };

  const handleDragLeave = (e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove(styles.dragOver);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    handleDragLeave(e);
    const ruleId = e.dataTransfer?.getData('ruleId');
    if (ruleId) {
      const ruleToMove = rules.value.find((r) => r.id === ruleId);
      if (!ruleToMove) return;

      await updateRule({ ...ruleToMove, groupId: group.id });
      showToast(group.id ? 'Moved to group' : 'Moved to Ungrouped');
    }
  };

  const handleToggleGroup = (enabled: boolean) => {
    toggleGroup(group.id, enabled);
    showToast(enabled ? '🚀 Group enabled' : '⏸ Group paused');
  };

  return (
    <>
      <details
        class={styles.groupWrapper}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <summary class={styles.groupHeader}>
          <span class={styles.arrow}>▶</span>
          <span class={styles.folder}>📁</span>
          <div class={styles.nameContainer} onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <form id={renameFormId} onSubmit={handleSave} class={styles.editForm}>
                <input
                  autoFocus
                  name="groupName" // Matches formData.get('groupName')
                  defaultValue={group.name}
                  class={styles.renameInput}
                />
              </form>
            ) : (
              <span class={styles.groupName}>{group.name}</span>
            )}
          </div>
          <div class={styles.actions} onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                {/* Linked to renameFormId */}
                <button type="submit" form={renameFormId} class={styles.actionBtn} title="Save">
                  ✅
                </button>
                <button type="button" class={styles.actionBtn} onClick={cancelEditing} title="Cancel">
                  ❌
                </button>
              </>
            ) : (
              <>
                <button type="button" class={styles.actionBtn} onClick={startEditing} title="Rename">
                  ✏️
                </button>
                <button
                  type="button"
                  class={styles.actionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    dialogRef.current?.showModal();
                  }}
                  title="Delete Group"
                >
                  🗑️
                </button>
              </>
            )}

            <Toggle small checked={group.enabled} onChange={handleToggleGroup} />
          </div>
        </summary>
        <div class={styles.groupContent}>{children}</div>
      </details>
      <dialog
        ref={dialogRef}
        class={styles.deleteDialog}
        onClick={(e) => e.target === dialogRef.current && closeDialog()}
      >
        <form id={deleteFormId} onSubmit={confirmDelete} class={styles.dialogInner} onClick={stop}>
          <h3>Delete Group</h3>
          <p>
            Are you sure you want to delete <strong>{group.name}</strong>?
          </p>

          <label class={styles.checkboxLabel}>
            <input type="checkbox" name="deleteRules" />
            <span>Also delete all rules inside this group</span>
          </label>

          <div class={styles.dialogActions}>
            <button type="button" class={styles.btnCancel} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" form={deleteFormId} class={styles.btnConfirm}>
              Delete Group
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
