import { useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { api } from './api';
import { useWorkspace } from './store';
export function useConnectionActions() {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const router = useRouter();
  async function openFile(file?: File) {
    if (!file || workspace.opening) return;
    workspace.connectionError = '';
    if (file.size > 100 * 1024 * 1024) {
      workspace.connectionError =
        'File uploads are limited to 100 MB. Open larger databases by their local path.';
      return;
    }
    workspace.opening = true;
    try {
      const connection = await api.upload(file);
      workspace.remember({ name: file.name, kind: 'file' });
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
      await router.push({
        name: 'connection',
        params: { connectionId: connection.id },
      });
    } catch (error) {
      workspace.connectionError =
        error instanceof Error ? error.message : 'Could not open this file.';
    } finally {
      workspace.opening = false;
    }
  }
  async function openPath(path: string, name: string, save = false) {
    if (workspace.opening || !path.trim()) return;
    workspace.opening = true;
    workspace.connectionError = '';
    try {
      const label =
        name.trim() || path.split(/[\\/]/).at(-1) || 'SQLite database';
      const connection = await api.open(path, label);
      workspace.remember({ name: label, kind: 'path', path }, save);
      await queryClient.invalidateQueries({ queryKey: ['connections'] });
      await router.push({
        name: 'connection',
        params: { connectionId: connection.id },
      });
    } catch (error) {
      workspace.connectionError =
        error instanceof Error
          ? error.message
          : 'Could not open this database.';
    } finally {
      workspace.opening = false;
    }
  }
  return { openFile, openPath };
}
