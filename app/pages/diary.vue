<template>
  <div class="calm-diary after-hours-diary max-w-lg lg:max-w-[90rem] mx-auto min-h-screen" :class="{ 'is-focus-mode': focusMode }">
    <div class="calm-diary-header after-hours-diary-header sticky top-0 z-30 px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center gap-2">
        <span class="calm-brand-mark after-hours-diary-mark" aria-hidden="true">✦</span>
        <h1 class="text-2xl font-bold tracking-tight">daybook</h1>
        <div class="ml-auto flex items-center gap-1.5">
          <UButton v-if="!focusMode" icon="i-lucide-search" color="neutral" variant="soft" size="md"
            aria-label="Search" :square="true" @click="toggleSearch" />
          <UButton v-if="!focusMode && selectedDate !== todayDate" icon="i-lucide-calendar-clock" color="neutral" variant="soft" size="md"
            aria-label="Jump to today" :square="true" @click="goToToday" />
          <UButton v-if="!focusMode" icon="i-lucide-calendar-range" color="neutral" variant="soft" size="md"
            aria-label="Week summary" :square="true" @click="openWeekSummary" />
          <UButton :icon="focusMode ? 'i-lucide-focus' : 'i-lucide-sparkles'" color="neutral" :variant="focusMode ? 'soft' : 'ghost'" size="md"
            :aria-label="focusMode ? 'Exit focus mode' : 'Enter focus mode'" :aria-pressed="focusMode" :square="true" @click="toggleFocusMode" />
        </div>
      </div>

      <!-- Search row -->
      <div v-if="searchOpen" class="after-hours-search-row relative mt-3">
        <input ref="searchInput" :value="searchQuery"
          @input="runSearch(($event.target as HTMLInputElement).value)"
          @keydown.escape="closeSearch"
          placeholder="Search tasks and notes..."
          class="w-full pl-10 pr-10 py-2.5 bg-(--ui-bg-elevated) rounded-xl border border-(--ui-border) outline-none placeholder:text-(--ui-text-dimmed) text-(--ui-text) text-sm transition-all focus:border-(--ui-primary)/50 focus:ring-1 focus:ring-(--ui-primary)/20" />
        <UIcon name="i-lucide-search" class="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-(--ui-text-dimmed)" />
        <button @click="closeSearch" class="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-(--ui-text-dimmed) active:text-(--ui-text-muted)">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>

        <div v-if="searchQuery || searching" class="absolute top-full left-0 right-0 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl bg-(--ui-bg-elevated) border border-(--ui-border) shadow-2xl z-40">
          <div v-if="searching" class="p-3 space-y-2">
            <div v-for="i in 3" :key="i" class="h-10 rounded-lg bg-(--ui-bg)/50 animate-pulse" />
          </div>
          <div v-else-if="searchResults.length" class="py-1">
            <template v-for="item in searchResults" :key="item.id">
              <NuxtLink v-if="item.type === 'task'" :to="`/tasks/${item.id}`" @click="closeSearch"
                class="flex items-center gap-2.5 px-4 py-3 transition-colors active:bg-(--ui-bg)">
                <UBadge color="primary" variant="subtle" size="xs">Task</UBadge>
                <span class="text-sm truncate" :class="item.completed && 'line-through text-(--ui-text-dimmed)'">{{ item.title }}</span>
              </NuxtLink>
              <NuxtLink v-else :to="`/notes/${item.id}`" @click="closeSearch"
                class="flex items-center gap-2.5 px-4 py-3 transition-colors active:bg-(--ui-bg)">
                <UBadge color="neutral" variant="subtle" size="xs">Note</UBadge>
                <span class="text-sm truncate">{{ item.title }}</span>
              </NuxtLink>
            </template>
          </div>
          <div v-else-if="searchQuery" class="p-4 text-center text-sm text-(--ui-text-dimmed)">No results found</div>
        </div>
      </div>
    </div>

    <div v-if="!focusMode" class="calm-workspace-strip after-hours-workspace-strip no-scrollbar" aria-label="Workspace filter">
      <button type="button" :class="{ active: activeId === null }" :aria-pressed="activeId === null" @click="selectWorkspace(null)">All</button>
      <button v-for="workspace in workspaces" :key="workspace.id" type="button"
        :class="{ active: activeId === workspace.id }" :aria-pressed="activeId === workspace.id" @click="selectWorkspace(workspace.id)">
        <span>{{ workspace.emoji }}</span>{{ workspace.name }}
      </button>
    </div>
    <div v-else class="daybook-focus-context" aria-label="Focus context">
      <span class="daybook-focus-context-dot" aria-hidden="true" />
      <span>Focus page</span>
      <span class="daybook-focus-context-divider" aria-hidden="true">/</span>
      <strong>{{ activeWorkspaceLabel }}</strong>
      <button type="button" @click="toggleFocusMode">Exit focus</button>
    </div>

    <!-- Day selector -->
    <div class="calm-day-rail after-hours-day-selector flex items-center gap-1.5 px-2 mt-2 py-2">
      <UButton icon="i-lucide-chevron-left" color="neutral" variant="soft" size="sm"
        aria-label="Previous day" :square="true" class="touch-target shrink-0" @click="shiftDay(-1)" />
      <div class="flex-1 min-w-0 flex gap-1.5 no-scrollbar overflow-x-auto scroll-hint">
        <button v-for="day in days" :key="day.date" :aria-current="selectedDate === day.date ? 'date' : undefined" @click="selectDay(day.date)"
          class="flex flex-col items-center flex-1 min-w-[2.75rem] px-1.5 py-2 rounded-xl transition-all duration-200 active:scale-95"
          :class="selectedDate === day.date
            ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
            : day.isToday
              ? 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-primary)/40'
              : 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)'">
          <span class="text-[10px] uppercase font-semibold tracking-wide"
            :class="selectedDate === day.date ? 'text-white/70' : 'text-(--ui-text-dimmed)'">{{ day.dayName }}</span>
          <span class="text-base font-bold mt-0.5 leading-tight">{{ day.dayNum }}</span>
          <div v-if="day.hasContent" class="w-1.5 h-1.5 rounded-full mt-0.5"
            :class="selectedDate === day.date ? 'bg-purple-200/80' : 'bg-(--ui-primary)'" />
        </button>
      </div>
      <UButton icon="i-lucide-chevron-right" color="neutral" variant="soft" size="sm"
        aria-label="Next day" :square="true" class="touch-target shrink-0" @click="shiftDay(1)" />
    </div>

    <!-- Day label + edit toggle -->
    <div class="calm-diary-toolbar after-hours-day-toolbar px-4 mt-5 flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">{{ selectedDayLabel }}</p>
      <div class="flex items-center gap-1">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-plus" @click="showAddTask = !showAddTask">
          Task
        </UButton>
        <UButton v-if="!focusMode" :color="hideDone ? 'primary' : 'neutral'" :variant="hideDone ? 'soft' : 'ghost'" size="sm"
          :icon="hideDone ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="hideDone ? 'Show done' : 'Hide done'"
          @click="toggleHideDone" />
      </div>
    </div>

    <!-- Task sort/group toolbar -->
    <div v-if="!focusMode" class="calm-diary-sort after-hours-sort-toolbar flex items-center gap-1.5 px-4 mt-3 overflow-x-auto no-scrollbar scroll-hint pb-0.5">
      <UDropdownMenu :items="diaryViewMenuItems" :ui="{ content: 'min-w-48' }">
        <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-sliders-horizontal"
          trailing-icon="i-lucide-chevron-down" class="shrink-0">
          View
        </UButton>
      </UDropdownMenu>
    </div>

    <!-- Quick add task -->
    <div v-if="showAddTask" class="calm-diary-quick-add after-hours-quick-add mt-3 -mx-0">
      <QuickAdd placeholder="Add a task for this day..." default-status="now" @add="handleAddTask" />
    </div>

    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 -translate-y-1">
      <div v-if="carriedTasks.length && !focusMode" class="daybook-carry-banner mx-4 mt-4">
        <div class="daybook-carry-icon" aria-hidden="true"><UIcon name="i-lucide-arrow-down-left" class="size-4" /></div>
        <div class="min-w-0 flex-1">
          <p class="daybook-carry-title">Carried forward</p>
          <p class="daybook-carry-copy">{{ carriedTasks.length }} unfinished {{ carriedTasks.length === 1 ? 'thread' : 'threads' }} from your last page.</p>
        </div>
        <UButton color="neutral" variant="ghost" size="xs" @click="scrollToTaskSection">Review</UButton>
      </div>
    </Transition>

    <!-- Loading -->
    <div v-if="loading" class="after-hours-loading px-4 mt-4">
      <USkeleton class="h-40 w-full" />
    </div>

    <div v-else class="calm-diary-content after-hours-diary-content px-4 mt-3 pb-8 space-y-6">
      <!-- Notes section -->
      <div class="calm-diary-note after-hours-note-card">
        <div class="daybook-journal-heading">
          <p class="after-hours-card-kicker text-xs font-semibold uppercase tracking-wider">Journal</p>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-copy" :square="true"
            :loading="copyPreviousLoading" aria-label="Copy notes from previous day" title="Copy notes from previous day"
            @click="copyPreviousDiary" />
        </div>

        <!-- Edit mode -->
        <div v-if="editMode" class="relative">
          <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
            leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
            <div v-if="saving" class="absolute top-2 right-2 flex items-center gap-1.5 text-xs text-(--ui-text-dimmed)">
              <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" /> Saving
            </div>
          </Transition>
          <textarea v-model="editContent" @input="handleContentInput" @focus="clearEditIdleTimer" @blur="handleEditorBlur"
            @keydown.escape="handleEditorEscape" ref="contentRef"
            class="w-full leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[160px] placeholder:text-(--ui-text-dimmed)"
            placeholder="Write about your day... Type @ to link a task or note" />
          <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 -translate-y-1">
            <UCard v-if="mentionOpen && mentionResults.length" class="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto overscroll-contain" :ui="{ body: 'p-1' }" style="top:0">
              <button v-for="item in mentionResults" :key="item.id" @mousedown.prevent="insertMention(item)"
                class="w-full px-3 py-3 text-left text-sm flex items-center gap-2 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
                <UBadge :color="item.type === 'task' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ item.type === 'task' ? 'Task' : 'Note' }}</UBadge>
                <span class="truncate">{{ item.title }}</span>
                <span class="text-xs text-(--ui-text-dimmed) font-mono ml-auto shrink-0">{{ item.display_id }}</span>
              </button>
            </UCard>
          </Transition>
        </div>

        <!-- Preview mode -->
        <div v-else class="daybook-journal-preview" role="button" tabindex="0" aria-label="Edit journal entry"
          @click="enterEditMode" @keydown.enter.prevent="enterEditMode" @keydown.space.prevent="enterEditMode">
          <div v-if="notesHtml" class="prose prose-invert prose-sm max-w-none
            prose-headings:text-(--ui-text) prose-p:text-(--ui-text-muted) prose-p:leading-7
            prose-a:text-(--ui-primary) prose-strong:text-(--ui-text)
            prose-code:text-(--ui-primary) prose-code:bg-(--ui-bg-elevated) prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-(--ui-bg-elevated) prose-pre:border prose-pre:border-(--ui-border)
            prose-li:text-(--ui-text-muted) prose-blockquote:border-(--ui-border) prose-blockquote:text-(--ui-text-dimmed)
            prose-hr:border-(--ui-border)"
            v-html="notesHtml" />
          <p v-else class="text-sm text-(--ui-text-dimmed) italic">No notes yet. Tap here to write.</p>
          <p class="daybook-journal-hint">Tap to edit · pauses save automatically</p>
        </div>
      </div>

      <!-- Tasks section -->
      <div ref="tasksSectionRef" class="calm-diary-tasks after-hours-tasks-card">
        <div class="daybook-task-heading">
          <div>
            <div class="flex items-center gap-1.5">
              <p class="after-hours-card-kicker text-xs font-semibold uppercase tracking-wider">Tasks</p>
              <UButton color="neutral" variant="ghost" size="xs"
                :icon="subtasksExpanded ? 'i-lucide-chevrons-up' : 'i-lucide-chevrons-down'"
                :disabled="!hasSubtasks"
                :aria-label="subtasksExpanded ? 'Collapse all subtasks' : 'Expand all subtasks'"
                :title="subtasksExpanded ? 'Collapse all subtasks' : 'Expand all subtasks'"
                @click="toggleAllSubtasks">
                {{ subtasksExpanded ? 'Collapse' : 'Expand' }}
              </UButton>
            </div>
            <p class="daybook-task-count">{{ pendingTaskIds.length }} open <span aria-hidden="true">·</span> {{ doneTaskIds.length }} done</p>
          </div>
          <div class="daybook-task-progress" :aria-label="`${completionPercent}% complete`">
            <span>{{ completionPercent }}%</span>
            <div class="daybook-task-progress-track"><i :style="{ width: `${completionPercent}%` }" /></div>
          </div>
        </div>
        <p v-if="reorderState !== 'idle'" class="daybook-reorder-status" :class="`is-${reorderState}`">
          <UIcon v-if="reorderState === 'saving'" name="i-lucide-loader-2" class="size-3 animate-spin" />
          <UIcon v-else-if="reorderState === 'saved'" name="i-lucide-check" class="size-3" />
          <UIcon v-else name="i-lucide-alert-circle" class="size-3" />
          {{ reorderState === 'saving' ? 'Saving order…' : reorderState === 'saved' ? 'Order saved' : 'Order could not be saved' }}
        </p>

        <!-- Desktop priority board -->
        <div class="daybook-desktop-task-view">
          <div class="daybook-kanban-grid">
            <section v-for="column in desktopBoardColumns" v-show="column.value !== 0 || column.tasks.length" :key="column.key" class="daybook-kanban-column">
              <header class="daybook-kanban-column-header">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon :name="column.icon" class="size-4 shrink-0" :class="column.textClass" />
                  <h2 class="text-sm font-semibold truncate" :class="column.textClass">{{ column.label }}</h2>
                </div>
                <div class="flex items-center gap-1">
                  <UButton v-if="column.value !== 0"
                    :icon="quickAddPriority === column.value ? 'i-lucide-x' : 'i-lucide-plus'"
                    color="neutral" variant="ghost" size="xs" :square="true"
                    :aria-label="`Add ${column.label} task`" @click="openQuickAdd(column.value)" />
                  <span class="daybook-kanban-count">{{ column.tasks.length }}</span>
                </div>
              </header>

              <div v-if="quickAddPriority === column.value && column.value !== 0" class="pt-3">
                <input ref="quickAddInputDesktop" v-model="quickAddTitle"
                  :placeholder="`Add to ${column.label}…`"
                  class="w-full px-3 py-2 bg-(--ui-bg-elevated) rounded-lg border border-(--ui-border) outline-none placeholder:text-(--ui-text-dimmed) text-(--ui-text) text-sm transition-all focus:border-(--ui-primary)/50 focus:ring-1 focus:ring-(--ui-primary)/20"
                  @keydown.enter.prevent="submitQuickAdd(column.value)"
                  @keydown.escape="cancelQuickAdd" />
              </div>

              <draggable
                :list="column.tasks"
                :group="{ name: 'daybook-priority', pull: true, put: true }"
                item-key="id"
                :animation="180"
                :disabled="reorderSaving"
                ghost-class="daybook-kanban-ghost"
                drag-class="daybook-kanban-drag"
                class="daybook-kanban-column-list"
                @change="(event: any) => handleDesktopBoardChange(event, column.value)">
                <template #item="{ element }">
                  <div class="daybook-kanban-card">
                    <InlineTask :task-id="element.id"
                      :initial-data="element"
                      :hide-done-subtasks="hideDone"
                      :subtask-expansion-token="subtaskExpansionToken"
                      :subtasks-expanded="subtasksExpanded"
                      variant="after-hours"
                      @update:completed="onTaskStatus" />
                  </div>
                </template>
              </draggable>
              <p v-if="!column.tasks.length" class="daybook-kanban-empty">Drop tasks here</p>
            </section>
          </div>
          <p v-if="!desktopBoardTaskCount" class="text-sm text-(--ui-text-dimmed) italic mt-4">
            {{ allTaskIds.length ? 'All tasks done for this day.' : 'No tasks for this day. Tap + Task to add one.' }}
          </p>

          <div v-if="doneTaskIds.length && !hideDone && !focusMode" class="daybook-desktop-done calm-diary-done after-hours-done-card">
            <button @click="doneOpen = !doneOpen"
              class="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2 py-1">
              <UIcon :name="doneOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
              <span>Done</span>
              <span class="text-(--ui-text-dimmed) font-mono normal-case">({{ doneTaskIds.length }})</span>
            </button>
            <div v-if="doneOpen" class="space-y-1.5">
              <InlineTask v-for="id in sortedDoneTaskIds" :key="id" :task-id="id"
                :initial-data="taskCache[id]"
                :subtask-expansion-token="subtaskExpansionToken"
                :subtasks-expanded="subtasksExpanded"
                variant="after-hours"
                @update:completed="onTaskStatus" />
            </div>
          </div>
        </div>

        <!-- Mobile Daybook list -->
        <div class="daybook-mobile-task-view">
        <template v-if="pendingGroups.length">
          <div v-for="group in pendingGroups" :key="group.key" class="after-hours-task-group mb-4 last:mb-0">
            <div v-if="taskGroup !== 'none'" class="flex items-center mb-1.5">
              <button type="button"
                class="flex-1 min-w-0 flex items-center text-[11px] font-semibold uppercase tracking-wider py-1"
                :class="group.labelClass || 'text-(--ui-text-dimmed)'"
                @click="toggleGroupCollapsed(group.key)">
                <UIcon :name="isGroupCollapsed(group.key) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3.5 mr-1" />
                <UIcon v-if="group.icon" :name="group.icon" class="size-3.5 mr-1 align-[-2px]" />
                {{ group.label }}
                <span class="text-(--ui-text-dimmed) font-mono normal-case ml-1">({{ group.ids.length }})</span>
              </button>
              <UButton v-if="taskGroup === 'priority' && group.value !== undefined && group.value !== 0"
                :icon="quickAddPriority === group.value ? 'i-lucide-x' : 'i-lucide-plus'"
                color="neutral" variant="ghost" size="xs" :square="true"
                :aria-label="`Add ${group.label} task`" @click="openQuickAdd(group.value)" />
            </div>
            <div v-if="!isGroupCollapsed(group.key)" class="after-hours-task-group-list space-y-1.5">
              <div v-if="taskGroup === 'priority' && group.value !== undefined && quickAddPriority === group.value">
                <input ref="quickAddInputMobile" v-model="quickAddTitle"
                  :placeholder="`Add to ${group.label}…`"
                  class="w-full px-3 py-2.5 bg-(--ui-bg-elevated) rounded-xl border border-(--ui-border) outline-none placeholder:text-(--ui-text-dimmed) text-(--ui-text) text-sm transition-all focus:border-(--ui-primary)/50 focus:ring-1 focus:ring-(--ui-primary)/20"
                  @keydown.enter.prevent="submitQuickAdd(group.value)"
                  @keydown.escape="cancelQuickAdd" />
              </div>
              <draggable
                v-if="taskSort === 'manual' && taskGroup === 'none'"
                :list="manualPendingTaskIds"
                item-key="id"
                handle=".daybook-drag-handle"
                :animation="180"
                :disabled="reorderSaving"
                ghost-class="daybook-drag-ghost"
                class="space-y-1.5"
                @change="handleDiaryReorder">
                <template #item="{ element }">
                  <div class="daybook-drag-row">
                    <button type="button" class="daybook-drag-handle" aria-label="Drag task to reorder">
                      <UIcon name="i-lucide-grip-vertical" class="size-4" />
                    </button>
                    <div class="min-w-0 flex-1">
                      <InlineTask :task-id="element"
                        :initial-data="taskCache[element]"
                        :hide-done-subtasks="hideDone"
                        :subtask-expansion-token="subtaskExpansionToken"
                        :subtasks-expanded="subtasksExpanded"
                        variant="after-hours"
                        @update:completed="onTaskStatus" />
                    </div>
                  </div>
                </template>
              </draggable>
              <template v-else>
                <InlineTask v-for="id in group.ids" :key="id" :task-id="id"
                  :initial-data="taskCache[id]"
                  :hide-done-subtasks="hideDone"
                  :subtask-expansion-token="subtaskExpansionToken"
                  :subtasks-expanded="subtasksExpanded"
                  variant="after-hours"
                  @update:completed="onTaskStatus" />
              </template>
            </div>
          </div>
        </template>
        <p v-else-if="!allTaskIds.length" class="text-sm text-(--ui-text-dimmed) italic">No tasks for this day. Tap + Task to add one.</p>
        <p v-else class="text-sm text-(--ui-text-dimmed) italic">All tasks done for this day.</p>
        </div>

      <!-- Done section (collapsed by default) -->
      <div v-if="doneTaskIds.length && !hideDone && !focusMode" class="calm-diary-done after-hours-done-card">
        <button @click="doneOpen = !doneOpen"
          class="w-full flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2 py-1">
          <UIcon :name="doneOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          <span>Done</span>
          <span class="text-(--ui-text-dimmed) font-mono normal-case">({{ doneTaskIds.length }})</span>
        </button>
        <div v-if="doneOpen" class="space-y-1.5">
          <draggable
            v-if="taskSort === 'manual'"
            :list="manualDoneTaskIds"
            item-key="id"
            handle=".daybook-drag-handle"
            :animation="180"
            :disabled="reorderSaving"
            ghost-class="daybook-drag-ghost"
            class="space-y-1.5"
            @change="handleDiaryReorder">
            <template #item="{ element }">
              <div class="daybook-drag-row">
                <button type="button" class="daybook-drag-handle" aria-label="Drag task to reorder">
                  <UIcon name="i-lucide-grip-vertical" class="size-4" />
                </button>
                <div class="min-w-0 flex-1">
                  <InlineTask :task-id="element"
                    :initial-data="taskCache[element]"
                    :subtask-expansion-token="subtaskExpansionToken"
                    :subtasks-expanded="subtasksExpanded"
                    variant="after-hours"
                    @update:completed="onTaskStatus" />
                </div>
              </div>
            </template>
          </draggable>
          <template v-else>
            <InlineTask v-for="id in sortedDoneTaskIds" :key="id" :task-id="id"
              :initial-data="taskCache[id]"
              :subtask-expansion-token="subtaskExpansionToken"
              :subtasks-expanded="subtasksExpanded"
              variant="after-hours"
              @update:completed="onTaskStatus" />
          </template>
        </div>
      </div>
        </div>
      </div>

    <!-- Week summary modal -->
    <UModal v-model:open="weekSummaryOpen" :ui="{ content: 'max-w-lg' }">
      <template #content>
        <div class="after-hours-modal surface-card rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div class="flex items-center justify-between px-4 py-3 border-b border-(--ui-border)">
            <div>
              <p class="text-[11px] uppercase font-semibold tracking-wider text-(--ui-text-dimmed)">Week summary</p>
              <p class="text-sm font-semibold mt-0.5">{{ weekRangeLabel }}</p>
            </div>
            <div class="flex items-center gap-1">
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" aria-label="Previous week" @click="shiftWeek(-1)" />
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" aria-label="Next week"
                :disabled="weekStart >= currentWeekStart" @click="shiftWeek(1)" />
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Close" @click="weekSummaryOpen = false" />
            </div>
          </div>
          <div class="flex-1 overflow-y-auto px-4 py-3">
            <div v-if="weekLoading" class="space-y-3">
              <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
            </div>
            <div v-else-if="!weekTotal" class="text-sm text-(--ui-text-dimmed) italic py-8 text-center">
              No tasks completed this week.
            </div>
            <div v-else class="space-y-4">
              <p class="text-xs text-(--ui-text-dimmed)">{{ weekTotal }} task{{ weekTotal === 1 ? '' : 's' }} completed</p>
              <div v-for="day in weekDays" :key="day.date" class="space-y-1.5">
                <div class="flex items-baseline justify-between">
                  <p class="text-xs font-semibold uppercase tracking-wider"
                    :class="day.isToday ? 'accent-text' : 'text-(--ui-text-dimmed)'">
                    {{ day.label }}
                    <span class="text-(--ui-text-dimmed) font-mono normal-case ml-1">({{ day.tasks.length }})</span>
                  </p>
                </div>
                <p v-if="!day.tasks.length" class="text-xs text-(--ui-text-dimmed) italic pl-1">—</p>
                <div v-else class="space-y-1.5">
                  <div v-for="g in day.groups" :key="g.parent?.id || g.rootTask?.id" class="rounded-lg bg-(--ui-bg-elevated) ring-1 ring-(--ui-border) overflow-hidden">
                    <NuxtLink v-if="g.parent" :to="`/tasks/${g.parent.id}`"
                      class="flex items-center gap-2 px-2.5 py-2 active:scale-[0.99] transition-transform"
                      @click="weekSummaryOpen = false">
                      <UIcon
                        :name="g.parent.completedThisDay ? 'i-lucide-check-circle-2' : 'i-lucide-folder'"
                        class="size-4 shrink-0"
                        :class="g.parent.completedThisDay ? 'accent-text' : 'text-(--ui-text-dimmed)'" />
                      <span class="text-sm flex-1 truncate"
                        :class="!g.parent.completedThisDay && 'text-(--ui-text-muted)'">{{ g.parent.title }}</span>
                      <UBadge color="neutral" variant="subtle" size="xs" class="font-mono shrink-0">{{ g.parent.display_id }}</UBadge>
                    </NuxtLink>
                    <div v-if="g.subtasks.length" class="border-t border-(--ui-border) px-2.5 py-1.5 space-y-1">
                      <NuxtLink v-for="s in g.subtasks" :key="s.id" :to="`/tasks/${s.id}`"
                        class="flex items-center gap-2 pl-4 py-1 active:scale-[0.99] transition-transform"
                        @click="weekSummaryOpen = false">
                        <UIcon name="i-lucide-check" class="size-3.5 shrink-0 accent-text" />
                        <span class="text-xs flex-1 truncate">{{ s.title }}</span>
                        <UBadge color="neutral" variant="subtle" size="xs" class="font-mono shrink-0">{{ s.display_id }}</UBadge>
                      </NuxtLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Outstanding: now + overdue -->
            <div class="mt-6 pt-4 border-t border-(--ui-border)">
              <div class="flex items-baseline justify-between mb-2">
                <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">
                  Outstanding
                  <span class="text-(--ui-text-dimmed) font-mono normal-case ml-1">({{ outstandingTasks.length }})</span>
                </p>
                <p class="text-[10px] text-(--ui-text-dimmed)">Now &amp; overdue</p>
              </div>
              <div v-if="outstandingLoading" class="space-y-2">
                <USkeleton v-for="i in 3" :key="i" class="h-12 w-full" />
              </div>
              <p v-else-if="!outstandingTasks.length" class="text-xs text-(--ui-text-dimmed) italic">Nothing outstanding. Nice.</p>
              <div v-else class="space-y-1">
                <NuxtLink v-for="t in outstandingTasks" :key="t.id" :to="`/tasks/${t.id}`"
                  class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-(--ui-bg-elevated) ring-1 ring-(--ui-border) active:scale-[0.99] transition-transform"
                  @click="weekSummaryOpen = false">
                  <UIcon
                    :name="t.is_overdue ? 'i-lucide-alert-triangle' : 'i-lucide-flame'"
                    class="size-4 shrink-0"
                    :class="t.is_overdue ? 'text-red-400' : 'accent-text'" />
                  <span class="text-sm flex-1 truncate">{{ t.title }}</span>
                  <span v-if="t.due_at" class="text-[11px] shrink-0"
                    :class="t.is_overdue ? 'text-red-400' : 'text-(--ui-text-dimmed)'">
                    {{ formatDueLabel(t.due_at, t.is_overdue) }}
                  </span>
                  <UBadge color="neutral" variant="subtle" size="xs" class="font-mono shrink-0">{{ t.display_id }}</UBadge>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Previous-day copy confirmation -->
    <UModal v-model:open="copyPreviousOpen" :ui="{ content: 'max-w-lg' }">
      <template #content>
        <div class="after-hours-modal surface-card rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div class="flex items-center justify-between px-4 py-3 border-b border-(--ui-border)">
            <div>
              <p class="text-[11px] uppercase font-semibold tracking-wider text-(--ui-text-dimmed)">Copy previous page</p>
              <p class="text-sm font-semibold mt-0.5">{{ previousDiaryLabel }}</p>
            </div>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Close" @click="copyPreviousOpen = false" />
          </div>
          <div class="flex-1 overflow-y-auto px-4 py-4">
            <p class="text-xs uppercase tracking-wider text-(--ui-text-dimmed) mb-2">Preview</p>
            <div class="daybook-copy-preview">{{ previousDiaryContent }}</div>
          </div>
          <div class="flex flex-col gap-2 px-4 py-3 border-t border-(--ui-border) sm:flex-row sm:justify-end">
            <UButton color="neutral" variant="ghost" @click="copyPreviousOpen = false">Cancel</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-plus" @click="applyPreviousDiary('append')">Append to today</UButton>
            <UButton color="primary" icon="i-lucide-copy" @click="applyPreviousDiary('replace')">Replace today</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import draggable from 'vuedraggable';
import { parseChecklist, hasChecklist, replaceChecklistWithMentions } from '~/composables/useChecklist';
import { parseHashtags } from '~/composables/useHashtagParse';
import { todayLocal, localDateOffset, parseUTC } from '~/composables/useDate';
import { PRIORITY_OPTIONS } from '~/composables/usePriority';
import type { Task } from '~/composables/useNotes';

interface DiaryEntry {
  id: string;
  workspace_id: string | null;
  entry_date: string;
  content: string;
  links?: any[];
}

const { activeId, workspaces, setActive } = useWorkspace();
const { createTask, updateTask } = useTasks();
const route = useRoute();
const router = useRouter();

const searchOpen = ref(false);
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const searching = ref(false);
const searchInput = ref<HTMLInputElement>();
let searchDebounce: ReturnType<typeof setTimeout>;

async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    await nextTick();
    searchInput.value?.focus();
  }
}
function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = '';
  searchResults.value = [];
}
function runSearch(q: string) {
  searchQuery.value = q;
  clearTimeout(searchDebounce);
  if (!q.trim()) { searchResults.value = []; return; }
  searchDebounce = setTimeout(async () => {
    searching.value = true;
    try {
      const p: Record<string, string> = { q };
      if (activeId.value) p.workspace_id = activeId.value;
      searchResults.value = await $fetch<any[]>('/api/search', { query: p });
    } finally { searching.value = false; }
  }, 300);
}
const { prefs, set: setPref } = usePreferences();
const toast = useToast();
const focusMode = ref(prefs.value.diaryFocusMode);
watch(() => prefs.value.diaryFocusMode, value => { focusMode.value = value; });

function toggleFocusMode() {
  focusMode.value = !focusMode.value;
  setPref('diaryFocusMode', focusMode.value);
  if (focusMode.value) closeSearch();
}

function routeDiaryDate(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const roundTrip = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  return roundTrip === candidate ? candidate : null;
}

const initialDate = routeDiaryDate(route.query.date) || todayLocal();
const selectedDate = ref(initialDate);
const dateWindowCenter = ref(initialDate);
const showAddTask = ref(false);
const subtaskExpansionToken = ref(0);
const subtasksExpanded = ref(true);
const entry = ref<DiaryEntry | null>(null);
const editContent = ref('');
const loading = ref(false);
const saving = ref(false);
const editMode = ref(false);
const copyPreviousOpen = ref(false);
const copyPreviousLoading = ref(false);
const previousDiaryDate = ref('');
const previousDiaryContent = ref('');
const carriedTasks = ref<{ id: string; title: string }[]>([]);
const entryDates = ref<Set<string>>(new Set());
const tasksSectionRef = ref<HTMLElement>();

const mentionOpen = ref(false);
const mentionResults = ref<any[]>([]);
const contentRef = ref<HTMLTextAreaElement>();
const creatingTasks = ref(false);
const doneOpen = ref(false);
const hideDone = ref(prefs.value.diaryHideDone);
function toggleHideDone() {
  hideDone.value = !hideDone.value;
  setPref('diaryHideDone', hideDone.value);
}

function toggleAllSubtasks() {
  subtasksExpanded.value = !subtasksExpanded.value;
  subtaskExpansionToken.value += 1;
}

watch(() => prefs.value.diaryHideDone, v => { hideDone.value = v; });
const taskCompleted = ref<Record<string, boolean>>({});
const taskCache = ref<Record<string, Task & { subtasks?: Task[] }>>({});
const hasSubtasks = computed(() => Object.values(taskCache.value).some(task => (task.subtasks?.length || 0) > 0));
type DiaryTaskSort = 'manual' | 'created' | 'priority';
const taskSort = ref<DiaryTaskSort>(prefs.value.diaryTaskSort);
const taskGroup = ref<'none' | 'created' | 'priority'>('none');
const manualPendingTaskIds = ref<string[]>([]);
const manualDoneTaskIds = ref<string[]>([]);
const manualListsReady = ref(false);
const reorderSaving = ref(false);
const reorderState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
let reorderStateTimer: ReturnType<typeof setTimeout>;

const activeWorkspaceLabel = computed(() => {
  if (activeId.value === null) return 'All workspaces';
  const workspace = workspaces.value.find(item => item.id === activeId.value);
  return workspace ? `${workspace.emoji} ${workspace.name}` : 'Workspace';
});

watch(() => prefs.value.diaryTaskSort, value => {
  if (value) taskSort.value = value;
});

function setTaskSort(value: DiaryTaskSort) {
  taskSort.value = value;
  setPref('diaryTaskSort', value);
  if (value === 'manual') taskGroup.value = 'none';
}

const diaryViewMenuItems = computed(() => [
  [
    { label: 'Custom order', icon: taskSort.value === 'manual' ? 'i-lucide-check' : 'i-lucide-grip-vertical', onSelect: () => setTaskSort('manual') },
    { label: 'Newest first', icon: taskSort.value === 'created' ? 'i-lucide-check' : 'i-lucide-clock', onSelect: () => setTaskSort('created') },
    { label: 'Priority first', icon: taskSort.value === 'priority' ? 'i-lucide-check' : 'i-lucide-flag', onSelect: () => setTaskSort('priority') },
  ],
  [
    { label: 'No grouping', icon: taskGroup.value === 'none' ? 'i-lucide-check' : 'i-lucide-list', onSelect: () => { taskGroup.value = 'none'; } },
    { label: 'By created date', icon: taskGroup.value === 'created' ? 'i-lucide-check' : 'i-lucide-calendar-days', onSelect: () => { taskGroup.value = 'created'; } },
    { label: 'By priority', icon: taskGroup.value === 'priority' ? 'i-lucide-check' : 'i-lucide-flag', onSelect: () => { taskGroup.value = 'priority'; } },
  ],
]);
const collapsedGroups = ref<Set<string>>(new Set());
function isGroupCollapsed(key: string) {
  return collapsedGroups.value.has(key);
}
function toggleGroupCollapsed(key: string) {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  collapsedGroups.value = next;
}

const todayDate = ref(todayLocal());

// Week summary state
interface CompletedTask {
  id: string;
  display_id: string;
  title: string;
  workspace_id: string | null;
  completed_at: string;
  parent_id: string | null;
  parent_task_id: string | null;
  parent_display_id: string | null;
  parent_title: string | null;
  parent_completed: boolean | null;
}
interface CompletedTaskGroup {
  parentId: string | null;
  parent: { id: string; display_id: string; title: string; completedThisDay: boolean } | null;
  rootTask: CompletedTask | null;
  subtasks: CompletedTask[];
}
interface OutstandingTask {
  id: string;
  display_id: string;
  title: string;
  status: string;
  priority: number;
  due_at: string | null;
  is_overdue: boolean;
}
const weekSummaryOpen = ref(false);
const weekStart = ref(''); // YYYY-MM-DD, Sunday start of viewed week
const weekLoading = ref(false);
const weekTasks = ref<CompletedTask[]>([]);
const outstandingTasks = ref<OutstandingTask[]>([]);
const outstandingLoading = ref(false);

function startOfWeekSunday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const currentWeekStart = computed(() => startOfWeekSunday(todayDate.value));
const weekEnd = computed(() => addDays(weekStart.value || currentWeekStart.value, 6));

const weekRangeLabel = computed(() => {
  if (!weekStart.value) return '';
  const fmt = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(weekStart.value)} – ${fmt(weekEnd.value)}`;
});

function onTaskStatus(payload: { id: string; completed: boolean }) {
  taskCompleted.value = { ...taskCompleted.value, [payload.id]: payload.completed };
}

// Day navigation
const days = computed(() => {
  const r: any[] = [];
  const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const td = todayLocal();
  for (let i = -3; i <= 3; i++) {
    const ds = addDays(dateWindowCenter.value, i);
    const d = new Date(ds + 'T12:00:00');
    r.push({ date: ds, dayName: dn[d.getDay()], dayNum: d.getDate(), isToday: ds === td, hasContent: entryDates.value.has(ds) });
  }
  return r;
});

const selectedDayLabel = computed(() => {
  const td = todayLocal();
  if (selectedDate.value === td) return 'Today';
  if (selectedDate.value === addDays(td, -1)) return 'Yesterday';
  if (selectedDate.value === addDays(td, 1)) return 'Tomorrow';
  return new Date(selectedDate.value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
});

// Aggregate all task IDs relevant to this day: carried + linked + mentioned
const allTaskIds = computed(() => {
  const ids = new Set<string>();
  for (const ct of carriedTasks.value) ids.add(ct.id);
  const taskLinks = entry.value?.links?.filter((l: any) => l.target_type === 'task') || [];
  for (const l of taskLinks) ids.add(l.target_id);
  const mentionRe = /@\[([^\]]+)\]/g;
  let m;
  while ((m = mentionRe.exec(editContent.value || '')) !== null) {
    const ref = m[1];
    const linked = taskLinks.find((l: any) => l.target_title === ref || l.target_id === ref);
    if (linked) ids.add(linked.target_id);
  }
  return [...ids];
});

const pendingTaskIds = computed(() => allTaskIds.value.filter(id => !taskCompleted.value[id]));
const doneTaskIds = computed(() => allTaskIds.value.filter(id => taskCompleted.value[id]));
const completionPercent = computed(() => {
  const total = pendingTaskIds.value.length + doneTaskIds.value.length;
  return total ? Math.round((doneTaskIds.value.length / total) * 100) : 0;
});

const allTaskMetadataLoaded = computed(() => allTaskIds.value.every(id => !!taskCache.value[id]));

// Fetch task metadata for sorting/grouping (dedupes + parallelizes)
watch(allTaskIds, async (ids) => {
  const missing = ids.filter(id => !taskCache.value[id]);
  if (!missing.length) return;
  const results = await Promise.all(
    missing.map(id => $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${id}`).catch(() => null))
  );
  const next = { ...taskCache.value };
  const nextCompleted = { ...taskCompleted.value };
  results.forEach((r, i) => {
    if (!r) return;
    next[missing[i]] = r;
    nextCompleted[missing[i]] = !!r.completed;
  });
  taskCache.value = next;
  taskCompleted.value = nextCompleted;
}, { immediate: true });

function sortByPosition(ids: string[]): string[] {
  const cache = taskCache.value;
  return [...ids].sort((a, b) => {
    const pa = cache[a]?.position ?? Number.MAX_SAFE_INTEGER;
    const pb = cache[b]?.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    const ta = cache[a]?.created_at ? parseUTC(cache[a]!.created_at).getTime() : 0;
    const tb = cache[b]?.created_at ? parseUTC(cache[b]!.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
}

function preserveExistingOrder(current: string[], next: string[]): string[] {
  const allowed = new Set(next);
  const retained = current.filter(id => allowed.has(id));
  // Newly-appearing tasks (e.g. just-created ones) go to the TOP of the list.
  const added = next.filter(id => !retained.includes(id));
  return [...added, ...retained];
}

function syncManualTaskLists() {
  const nextPending = sortByPosition(pendingTaskIds.value);
  const nextDone = sortByPosition(doneTaskIds.value);
  if (!manualListsReady.value) {
    if (!allTaskMetadataLoaded.value) {
      manualPendingTaskIds.value = [...pendingTaskIds.value];
      manualDoneTaskIds.value = [...doneTaskIds.value];
      return;
    }
    manualPendingTaskIds.value = nextPending;
    manualDoneTaskIds.value = nextDone;
    manualListsReady.value = true;
    return;
  }
  manualPendingTaskIds.value = preserveExistingOrder(manualPendingTaskIds.value, nextPending);
  manualDoneTaskIds.value = preserveExistingOrder(manualDoneTaskIds.value, nextDone);
}

watch([pendingTaskIds, doneTaskIds, allTaskMetadataLoaded], syncManualTaskLists, { immediate: true });

function sortIds(ids: string[]): string[] {
  const cache = taskCache.value;
  const arr = [...ids];
  if (taskSort.value === 'manual') return sortByPosition(arr);
  if (taskSort.value === 'priority') {
    arr.sort((a, b) => {
      const pa = cache[a]?.priority ?? 0;
      const pb = cache[b]?.priority ?? 0;
      if (pa !== pb) return pb - pa;
      const ta = cache[a]?.created_at ? parseUTC(cache[a]!.created_at).getTime() : 0;
      const tb = cache[b]?.created_at ? parseUTC(cache[b]!.created_at).getTime() : 0;
      return tb - ta;
    });
  } else {
    arr.sort((a, b) => {
      const ta = cache[a]?.created_at ? parseUTC(cache[a]!.created_at).getTime() : 0;
      const tb = cache[b]?.created_at ? parseUTC(cache[b]!.created_at).getTime() : 0;
      return tb - ta;
    });
  }
  return arr;
}

const sortedPendingTaskIds = computed(() => sortIds(pendingTaskIds.value));
const sortedDoneTaskIds = computed(() => sortIds(doneTaskIds.value));

interface DesktopBoardColumn {
  key: string;
  value: number;
  label: string;
  icon: string;
  textClass: string;
  tasks: (Task & { subtasks?: Task[] })[];
}

const desktopBoardColumnMeta: Omit<DesktopBoardColumn, 'tasks'>[] = [
  ...PRIORITY_OPTIONS.map(option => ({
    key: `p${option.value}`,
    value: option.value,
    label: option.label,
    icon: option.icon,
    textClass: option.textClass,
  })),
  {
    key: 'p0',
    value: 0,
    label: 'Unsorted',
    icon: 'i-lucide-minus',
    textClass: 'text-(--ui-text-dimmed)',
  },
];

const desktopBoardColumns = ref<DesktopBoardColumn[]>([]);
const desktopBoardTaskSetKey = computed(() =>
  pendingTaskIds.value.filter(id => !!taskCache.value[id]).sort().join('|')
);
const desktopBoardTaskCount = computed(() =>
  desktopBoardColumns.value.reduce((count, column) => count + column.tasks.length, 0)
);

function buildDesktopBoardColumns() {
  const knownIds = pendingTaskIds.value.filter(id => !!taskCache.value[id]);
  const known = new Set(knownIds);
  const preferredOrder = manualPendingTaskIds.value.filter(id => known.has(id));
  const fallbackOrder = desktopBoardColumns.value.flatMap(column => column.tasks.map(task => task.id));
  const order = preserveExistingOrder(
    preferredOrder.length ? preferredOrder : fallbackOrder,
    sortByPosition(knownIds),
  );
  const columns = desktopBoardColumnMeta.map(column => ({ ...column, tasks: [] as (Task & { subtasks?: Task[] })[] }));

  for (const id of order) {
    const task = taskCache.value[id];
    if (!task) continue;
    const column = columns.find(item => item.value === (task.priority || 0)) || columns.at(-1)!;
    column.tasks.push(task);
  }

  desktopBoardColumns.value = columns;
}

watch([desktopBoardTaskSetKey, allTaskMetadataLoaded, selectedDate], buildDesktopBoardColumns, { immediate: true });

async function handleDiaryReorder() {
  const order = [...manualPendingTaskIds.value, ...manualDoneTaskIds.value];
  if (!order.length || reorderSaving.value) return;

  const nextCache = { ...taskCache.value };
  order.forEach((id, index) => {
    if (nextCache[id]) nextCache[id] = { ...nextCache[id], position: index };
  });
  taskCache.value = nextCache;
  manualListsReady.value = true;
  reorderSaving.value = true;
  reorderState.value = 'saving';
  clearTimeout(reorderStateTimer);
  try {
    await Promise.all(order.map((id, position) => updateTask(id, { position } as any)));
    reorderState.value = 'saved';
    reorderStateTimer = setTimeout(() => { reorderState.value = 'idle'; }, 1800);
  } catch {
    reorderState.value = 'error';
    toast.add({ title: 'Order could not be saved', description: 'Your list is still visible; try moving it again.', color: 'error' });
  } finally {
    reorderSaving.value = false;
  }
  buildDesktopBoardColumns();
}

async function handleDesktopBoardChange(event: any, targetPriority: number) {
  if (!event.added && !event.moved) return;

  const patches = new Map<string, Partial<Task>>();
  if (event.added) {
    const task = event.added.element as Task & { subtasks?: Task[] };
    if (task.priority !== targetPriority) {
      task.priority = targetPriority;
      patches.set(task.id, { priority: targetPriority });
    }
  }

  const pendingOrder = desktopBoardColumns.value.flatMap(column => column.tasks.map(task => task.id));
  const doneOrder = manualDoneTaskIds.value.filter(id => !!taskCache.value[id]);
  const order = [...pendingOrder, ...doneOrder];
  manualPendingTaskIds.value = pendingOrder;
  manualDoneTaskIds.value = doneOrder;
  manualListsReady.value = true;

  const nextCache = { ...taskCache.value };
  order.forEach((id, position) => {
    if (!nextCache[id]) return;
    nextCache[id] = { ...nextCache[id], position };
    patches.set(id, { ...(patches.get(id) || {}), position });
  });
  taskCache.value = nextCache;

  reorderSaving.value = true;
  reorderState.value = 'saving';
  clearTimeout(reorderStateTimer);
  try {
    await Promise.all([...patches.entries()].map(([id, patch]) => updateTask(id, patch as any)));
    reorderState.value = 'saved';
    reorderStateTimer = setTimeout(() => { reorderState.value = 'idle'; }, 1800);
  } catch {
    reorderState.value = 'error';
    toast.add({ title: 'Board change could not be saved', description: 'The task remains in the current column for now.', color: 'error' });
  } finally {
    reorderSaving.value = false;
  }
}

interface TaskGroup { key: string; label: string; ids: string[]; icon?: string; labelClass?: string; value?: number; }

const pendingGroups = computed<TaskGroup[]>(() => {
  const ids = sortedPendingTaskIds.value;
  if (!ids.length) return [];
  if (taskGroup.value === 'none') {
    return [{ key: 'all', label: '', ids }];
  }
  if (taskGroup.value === 'priority') {
    const groups = new Map<number, string[]>();
    for (const id of ids) {
      const p = taskCache.value[id]?.priority ?? 0;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p)!.push(id);
    }
    const out: TaskGroup[] = [];
    for (const opt of PRIORITY_OPTIONS) {
      const list = groups.get(opt.value);
      if (list?.length) out.push({ key: `p${opt.value}`, label: opt.label, ids: list, icon: opt.icon, labelClass: opt.textClass, value: opt.value });
    }
    const none = groups.get(0);
    if (none?.length) out.push({ key: 'p0', label: 'No priority', ids: none, icon: 'i-lucide-minus', value: 0 });
    return out;
  }
  // group by created date
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const ca = taskCache.value[id]?.created_at;
    const key = ca ? String(ca).slice(0, 10) : 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  const today = todayLocal();
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => {
      let label = key;
      if (key === today) label = 'Today';
      else if (key === localDateOffset(-1)) label = 'Yesterday';
      else if (key !== 'unknown') {
        const d = new Date(key + 'T12:00:00');
        label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else {
        label = 'Unknown';
      }
      return { key, label, ids: list, icon: 'i-lucide-calendar' };
    });
});

// Notes body: markdown of content with @[...] mentions stripped (tasks shown in Tasks section)
const notesHtml = computed(() => {
  if (!editContent.value) return '';
  const cleaned = editContent.value
    .replace(/@\[[^\]]+\]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) return '';
  return marked.parse(cleaned) as string;
});

function scrollToTaskSection() {
  tasksSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function selectDay(date: string) {
  selectedDate.value = date;
  if (routeDiaryDate(route.query.date) !== date) {
    void router.replace({ query: { ...route.query, date } });
  }
  await fetchEntry();
}

async function goToToday() {
  todayDate.value = todayLocal();
  dateWindowCenter.value = todayDate.value;
  await selectDay(todayDate.value);
  await fetchDateIndicators();
}

async function shiftDay(delta: number) {
  dateWindowCenter.value = addDays(dateWindowCenter.value, delta);
  await selectDay(addDays(selectedDate.value, delta));
  await fetchDateIndicators();
}

function localDateOfTimestamp(ts: string): string {
  const d = parseUTC(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupCompletedTasks(tasksForDay: CompletedTask[]): CompletedTaskGroup[] {
  const map = new Map<string, CompletedTaskGroup>();
  const order: string[] = [];
  // Group key is the parent task's id when a subtask exists; otherwise the task's own id.
  // Parent completed on same day gets the same key as its subtasks so they merge.
  for (const t of tasksForDay) {
    const isSubtask = !!t.parent_id;
    const groupKey = isSubtask ? t.parent_id! : t.id;
    let g = map.get(groupKey);
    if (!g) {
      g = { parentId: isSubtask ? t.parent_id : null, parent: null, rootTask: null, subtasks: [] };
      map.set(groupKey, g);
      order.push(groupKey);
    }
    if (isSubtask) {
      g.subtasks.push(t);
      if (!g.parent && t.parent_task_id && t.parent_title && t.parent_display_id) {
        g.parent = {
          id: t.parent_task_id,
          display_id: t.parent_display_id,
          title: t.parent_title,
          completedThisDay: false,
        };
      }
    } else {
      g.rootTask = t;
      g.parent = { id: t.id, display_id: t.display_id, title: t.title, completedThisDay: true };
    }
  }
  return order.map(k => map.get(k)!);
}

const weekDays = computed(() => {
  if (!weekStart.value) return [] as { date: string; label: string; isToday: boolean; tasks: CompletedTask[]; groups: CompletedTaskGroup[] }[];
  const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const out: { date: string; label: string; isToday: boolean; tasks: CompletedTask[]; groups: CompletedTaskGroup[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart.value, i);
    const d = new Date(date + 'T12:00:00');
    const tasks = weekTasks.value.filter(t => localDateOfTimestamp(t.completed_at) === date);
    const groups = groupCompletedTasks(tasks);
    out.push({
      date,
      label: `${dn[d.getDay()]} ${d.getDate()}`,
      isToday: date === todayDate.value,
      tasks,
      groups,
    });
  }
  return out;
});

const weekTotal = computed(() => weekDays.value.reduce((n, d) => n + d.tasks.length, 0));

async function loadWeek() {
  if (!weekStart.value) return;
  weekLoading.value = true;
  try {
    const q: Record<string, string> = { from: weekStart.value, to: weekEnd.value };
    if (activeId.value) q.workspace_id = activeId.value;
    weekTasks.value = await $fetch<CompletedTask[]>('/api/tasks/completed', { query: q });
  } catch {
    weekTasks.value = [];
  } finally {
    weekLoading.value = false;
  }
}

async function loadOutstanding() {
  outstandingLoading.value = true;
  try {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    outstandingTasks.value = await $fetch<OutstandingTask[]>('/api/tasks/outstanding', { query: q });
  } catch {
    outstandingTasks.value = [];
  } finally {
    outstandingLoading.value = false;
  }
}

function formatDueLabel(due: string | null, isOverdue: boolean): string {
  if (!due) return '';
  const d = parseUTC(due);
  const now = new Date();
  const dLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dLocal.getTime() - nowLocal.getTime()) / 86400000);
  if (isOverdue) {
    if (diffDays === 0) return 'Overdue today';
    return `${Math.abs(diffDays)}d overdue`;
  }
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openWeekSummary() {
  todayDate.value = todayLocal();
  // Default view: the current Sunday–Saturday week, including progress so far.
  weekStart.value = currentWeekStart.value;
  weekSummaryOpen.value = true;
  loadWeek();
  loadOutstanding();
}

function shiftWeek(delta: number) {
  const next = addDays(weekStart.value, delta * 7);
  if (next > currentWeekStart.value) return;
  weekStart.value = next;
  loadWeek();
}

watch(activeId, () => { if (weekSummaryOpen.value) { loadWeek(); loadOutstanding(); } });

let entryRequestId = 0;
async function fetchEntry() {
  const requestId = ++entryRequestId;
  const requestedDate = selectedDate.value;
  const requestedWorkspaceId = activeId.value;
  loading.value = true;
  entry.value = null;
  editContent.value = '';
  subtaskExpansionToken.value = 0;
  subtasksExpanded.value = true;
  carriedTasks.value = [];
  taskCompleted.value = {};
  taskCache.value = {};
  manualPendingTaskIds.value = [];
  manualDoneTaskIds.value = [];
  manualListsReady.value = false;
  desktopBoardColumns.value = [];
  doneOpen.value = false;
  collapsedGroups.value = new Set();
  quickAddPriority.value = null;
  quickAddTitle.value = '';
  try {
    const q: Record<string, string> = {};
    if (requestedWorkspaceId) q.workspace_id = requestedWorkspaceId;

    // Try to get existing entry
    const data = await $fetch<DiaryEntry>(`/api/diary/${requestedDate}`, { query: q }).catch(() => null);
    if (data) {
      if (requestId !== entryRequestId) return;
      entry.value = data;
      editContent.value = data.content;
      editMode.value = false;
      return;
    }

    // Create new entry (triggers carry-forward) — POST now returns links
    const created = await $fetch<DiaryEntry & { carried_tasks?: { id: string; title: string }[] }>('/api/diary', {
      method: 'POST',
      body: { entry_date: requestedDate, workspace_id: requestedWorkspaceId },
    });
    if (requestId !== entryRequestId) return;
    entry.value = created;
    editContent.value = created.content;
    carriedTasks.value = created.carried_tasks || [];
    editMode.value = false;
  } finally {
    if (requestId === entryRequestId) loading.value = false;
  }
}

function selectWorkspace(workspaceId: string | null) {
  if (activeId.value === workspaceId) return;
  setActive(workspaceId);
}

// Track which dates have content (batch endpoint)
let indicatorRequestId = 0;
async function fetchDateIndicators() {
  const requestId = ++indicatorRequestId;
  try {
    const fromDate = days.value[0]?.date || addDays(dateWindowCenter.value, -3);
    const toDate = days.value.at(-1)?.date || addDays(dateWindowCenter.value, 3);
    const q: Record<string, string> = { from: fromDate, to: toDate };
    if (activeId.value) q.workspace_id = activeId.value;
    const dates = await $fetch<string[]>('/api/diary/dates', { query: q });
    if (requestId === indicatorRequestId) entryDates.value = new Set(dates);
  } catch {}
}

onMounted(async () => {
  await fetchEntry();
  fetchDateIndicators();
});
watch(activeId, async () => {
  await fetchEntry();
  fetchDateIndicators();
});
watch(() => route.query.date, async (value) => {
  const date = routeDiaryDate(value);
  if (!date || date === selectedDate.value) return;
  selectedDate.value = date;
  dateWindowCenter.value = date;
  await fetchEntry();
  fetchDateIndicators();
});

// Autosave
let saveTimer: ReturnType<typeof setTimeout>;
let editIdleTimer: ReturnType<typeof setTimeout>;
const editIdleDelay = 6000;

const previousDiaryLabel = computed(() => {
  if (!previousDiaryDate.value) return 'Yesterday';
  return new Date(`${previousDiaryDate.value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
});

function clearEditIdleTimer() {
  clearTimeout(editIdleTimer);
}

function scheduleEditIdleView(delay = editIdleDelay) {
  clearEditIdleTimer();
  if (!editMode.value) return;
  editIdleTimer = setTimeout(() => {
    if (mentionOpen.value) {
      scheduleEditIdleView(500);
      return;
    }
    // Keeping the journal focused means the person is still writing or thinking.
    // Only return to preview after they have moved on from the editor.
    if (contentRef.value === document.activeElement) return;
    void exitEditMode();
  }, delay);
}

async function persistDiaryContent(date: string, content: string, workspaceId: string | null) {
  await $fetch(`/api/diary/${date}`, {
    method: 'PUT',
    body: { content, workspace_id: workspaceId },
  });
  if (content.trim()) entryDates.value.add(date);
}

function saveContent() {
  if (!entry.value) return;
  clearTimeout(saveTimer);
  saving.value = true;
  const dateToSave = selectedDate.value;
  const contentToSave = editContent.value;
  const workspaceId = activeId.value;
  saveTimer = setTimeout(async () => {
    try {
      await persistDiaryContent(dateToSave, contentToSave, workspaceId);
    } catch {
      toast.add({ title: 'Diary could not be saved', description: 'Your writing is still here; try again in a moment.', color: 'error' });
    } finally {
      saving.value = false;
    }
  }, 300);
}

async function flushSaveContent() {
  clearTimeout(saveTimer);
  if (!entry.value) return;
  saving.value = true;
  try {
    await persistDiaryContent(selectedDate.value, editContent.value, activeId.value);
  } catch {
    toast.add({ title: 'Diary could not be saved', description: 'Your writing is still here; try again in a moment.', color: 'error' });
  } finally {
    saving.value = false;
  }
}

function enterEditMode() {
  if (editMode.value) return;
  editMode.value = true;
  nextTick(() => {
    const el = contentRef.value;
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
  });
}

function handleEditorBlur() {
  saveContent();
  if (!mentionOpen.value) scheduleEditIdleView(350);
}

function handleEditorEscape() {
  if (mentionOpen.value) {
    mentionOpen.value = false;
    return;
  }
  void exitEditMode();
}

// Debounced mention search
let mentionTimer: ReturnType<typeof setTimeout>;
function debouncedSearchMentions(q: string) {
  clearTimeout(mentionTimer);
  mentionTimer = setTimeout(() => searchMentions(q), 200);
}

function handleContentInput() {
  saveContent();
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value.substring(0, pos); const at = text.lastIndexOf('@');
  if (at >= 0 && (at === 0 || text[at - 1] === ' ' || text[at - 1] === '\n')) {
    const q = text.substring(at + 1);
    if (q.length > 0 && !q.includes(' ') && !q.includes('\n')) {
      mentionOpen.value = true; debouncedSearchMentions(q); scheduleEditIdleView(); return;
    }
  }
  mentionOpen.value = false;
  scheduleEditIdleView();
}

async function convertChecklistToTasks() {
  if (!hasChecklist(editContent.value) || !entry.value) return;
  // Leaving the editor still converts checklist lines into linked tasks.
  creatingTasks.value = true;
  try {
    const items = parseChecklist(editContent.value);
    if (items.length) {
      // Apply hashtag parsing recursively to every checklist item
      const applyParse = (it: any): any => {
        const p = parseHashtags(it.title);
        return {
          title: p.title,
          checked: it.checked,
          tags: p.tags,
          priority: p.priority,
          status: p.status,
          due_at: p.due_at ? new Date(p.due_at).toISOString() : undefined,
          children: (it.children || []).map(applyParse),
        };
      };
      const parsedItems = items.map(applyParse);

      await $fetch<any[]>('/api/tasks/from-checklist', {
        method: 'POST',
        body: {
          items: parsedItems,
          source_type: 'diary',
          source_id: entry.value.id,
          workspace_id: activeId.value,
          due_date: selectedDate.value,
        },
      });

      const rootPairs = items.map((orig, idx) => ({ original: orig.title.trim(), clean: parsedItems[idx].title }));
      editContent.value = replaceChecklistWithMentions(editContent.value, rootPairs);

      // Reload entry to get updated links
      const q: Record<string, string> = {};
      if (activeId.value) q.workspace_id = activeId.value;
      const full = await $fetch<DiaryEntry>(`/api/diary/${selectedDate.value}`, { query: q }).catch(() => null);
      if (full) entry.value = full;
    }
  } finally {
    creatingTasks.value = false;
  }
}

async function exitEditMode() {
  if (!editMode.value) return;
  clearEditIdleTimer();
  mentionOpen.value = false;
  await convertChecklistToTasks();
  await flushSaveContent();
  editMode.value = false;
}

async function copyPreviousDiary() {
  const previousDate = addDays(selectedDate.value, -1);
  copyPreviousLoading.value = true;
  try {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    const previous = await $fetch<DiaryEntry>(`/api/diary/${previousDate}`, { query: q }).catch(() => null);
    const content = previous?.content?.trim();
    if (!content) {
      toast.add({ title: 'No notes on the previous page', color: 'neutral' });
      return;
    }
    previousDiaryDate.value = previousDate;
    previousDiaryContent.value = previous.content;
    if (editContent.value.trim()) {
      copyPreviousOpen.value = true;
      return;
    }
    await applyPreviousDiary('replace');
  } finally {
    copyPreviousLoading.value = false;
  }
}

async function applyPreviousDiary(mode: 'append' | 'replace') {
  const source = previousDiaryContent.value.trim();
  if (!source) return;
  const current = editContent.value.trim();
  editContent.value = mode === 'append' && current ? `${current}\n\n${source}` : source;
  copyPreviousOpen.value = false;
  await flushSaveContent();
  toast.add({ title: mode === 'append' ? 'Previous notes appended' : 'Previous notes copied', color: 'success' });
}

async function handleAddTask(data: { title: string; due_at?: string; subtasks?: string[]; tags?: string[]; priority?: number; status?: string }) {
  const dueAt = data.due_at || new Date(`${selectedDate.value}T09:00`).toISOString();
  const task = await createTask({ title: data.title, due_at: dueAt, tags: data.tags, workspace_id: activeId.value, priority: data.priority, status: data.status });
  if (data.subtasks?.length) {
    for (const sub of data.subtasks) await createTask({ title: sub, parent_id: task.id, workspace_id: activeId.value });
  }
  const mention = `@[${task.title}]`;
  editContent.value = editContent.value?.trim() ? `${editContent.value}\n${mention}` : mention;
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: 'task', target_id: task.id } }).catch(() => {});
    const newLink = { link_id: '', target_type: 'task', target_id: task.id, target_title: task.title };
    entry.value.links = [...(entry.value.links || []), newLink];
  }
  entryDates.value.add(selectedDate.value);
  saveContent();
  showAddTask.value = false;
}

// --- Per-priority-group quick add ---
const quickAddPriority = ref<number | null>(null);
const quickAddTitle = ref('');
const quickAddInputMobile = ref<HTMLInputElement>();
const quickAddInputDesktop = ref<HTMLInputElement>();

function focusQuickAddInputs() {
  // Only one of these is visible (mobile vs desktop layout); focusing the
  // hidden one is a harmless no-op.
  quickAddInputMobile.value?.focus();
  quickAddInputDesktop.value?.focus();
}

function openQuickAdd(priority: number) {
  if (quickAddPriority.value === priority) {
    cancelQuickAdd();
    return;
  }
  quickAddPriority.value = priority;
  quickAddTitle.value = '';
  // Make sure the target group is expanded so its input is visible.
  const key = `p${priority}`;
  if (collapsedGroups.value.has(key)) {
    const next = new Set(collapsedGroups.value);
    next.delete(key);
    collapsedGroups.value = next;
  }
  nextTick(focusQuickAddInputs);
}

function cancelQuickAdd() {
  quickAddPriority.value = null;
  quickAddTitle.value = '';
}

async function submitQuickAdd(priority: number) {
  const title = quickAddTitle.value.trim();
  if (!title) return;
  quickAddTitle.value = '';
  const dueAt = new Date(`${selectedDate.value}T09:00`).toISOString();
  const task = await createTask({ title, due_at: dueAt, workspace_id: activeId.value, priority, status: 'now' });
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: 'task', target_id: task.id } }).catch(() => {});
    const newLink = { link_id: '', target_type: 'task', target_id: task.id, target_title: task.title };
    entry.value.links = [...(entry.value.links || []), newLink];
  }
  entryDates.value.add(selectedDate.value);
  // Keep the input open for rapid multi-add.
  nextTick(focusQuickAddInputs);
}

async function searchMentions(q: string) { mentionResults.value = await $fetch<any[]>('/api/mention', { query: { q } }); }

async function insertMention(item: { id: string; type: string; title: string }) {
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value; const at = text.lastIndexOf('@', pos - 1);
  editContent.value = text.substring(0, at) + `@[${item.title}]` + text.substring(pos);
  mentionOpen.value = false;
  if (entry.value) {
    await $fetch('/api/links', { method: 'POST', body: { source_type: 'diary', source_id: entry.value.id, target_type: item.type, target_id: item.id } });
    // Optimistically add link to local state
    const newLink = { link_id: '', target_type: item.type, target_id: item.id, target_title: item.title };
    if (entry.value.links) {
      entry.value.links.push(newLink);
    } else {
      entry.value.links = [newLink];
    }
  }
  saveContent();
}
</script>
