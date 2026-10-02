import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import ExplorerView from './views/ExplorerView.vue';
export const routes = [
  { path: '/', name: 'home', component: HomeView },
  {
    path: '/connections/:connectionId',
    name: 'connection',
    component: ExplorerView,
  },
  {
    path: '/connections/:connectionId/tables/:schema/:tableName',
    name: 'table',
    component: ExplorerView,
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];
export const router = createRouter({ history: createWebHistory(), routes });
