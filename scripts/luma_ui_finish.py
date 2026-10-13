"""Scoped interface copy and palette maintenance; no user material is touched."""
from pathlib import Path

def edit(file, replacements):
    p=Path(file); text=p.read_text(encoding='utf-8')
    for old,new in replacements: text=text.replace(old,new)
    p.write_text(text,encoding='utf-8')

edit('src/app/AppShell/AppShell.css',[(a,b) for a,b in {
 '#c38d8b':'var(--text-primary)','#b5b3bd':'var(--text-secondary)','#fff8f5':'var(--text-primary)',
 'rgb(255 255 255 / 6%)':'var(--surface-hover)','rgb(255 255 255 / 9%)':'var(--surface-selected)',
 '#c97876':'var(--text-primary)','#97939e':'var(--text-muted)','#cfccd2':'var(--text-secondary)',
 '#aaa7b0':'var(--text-secondary)','color: white':'color: var(--text-primary)'
}.items()])
for file in ['src/features/settings/SettingsPage.tsx','src/features/practice/reading/ReadingWorkspace.tsx']:
    edit(file,[('useState(17)','useState(18)'),('|| 17','|| 18')])
edit('src/components/VisualBlock/VisualBlock.tsx', list({
 '题包图片引用不存在。':'The pack image reference is missing.',
 '图片读取失败；请检查工作区资源，或在导入器重新截取。':'Unable to read this workspace image. Check the installed pack.',
 '缩小原图':'Zoom out','放大原图':'Zoom in','适应宽度':'Fit width',
 '原图独立滚动区域':'Original image scroll region','正在读取工作区图片…':'Loading local image…'
}.items()))
edit('src/components/QuestionGroupContext/QuestionGroupContext.tsx',list({
 '黄色':'Yellow','绿色':'Green','蓝色':'Blue','粉色':'Pink','下划线':'Underline',
 '可在同一段落、列表项或单元格内选择文字。':'Select text within one paragraph or cell.',
 '一次标记只能位于同一个稳定上下文块内；跨单元格选择暂不支持。':'Select within one paragraph or cell.',
 '没有捕获到可保存的文字选择。':'No text selection was captured.',
 '请先选择同一个上下文块中的文字。':'Select text within one paragraph first.',
 '上下文文字标记样式':'Context annotation styles',
 '无效题目引用':'Invalid question reference',
 '已选中“${anchor.quote}”。请选择标记样式。':'Selected “${anchor.quote}”. Choose a style.',
 '已保存“${pendingAnchor.quote}”的标记。':'Annotation saved.',
 '标记文字“${segment.text}”；点击删除':'Annotated “${segment.text}”; click to remove',
 '删除标记“${primary.anchor.quote}”？':'Remove annotation “${primary.anchor.quote}”?',
 '个旧标记无法安全定位。':'previous annotations could not be located.',
 '添加${label}${style === "underline" ? "标记" : "高亮"}':'Add ${label} annotation'
}.items()))
edit('src/features/vocabulary/VocabularyPage.tsx',list({
 'Download, Search, Trash2':'Download, Trash2',
 '  const [query, setQuery] = useState("");\n':'',
 '    const needle = query.trim().toLocaleLowerCase();\n':'',
 '      (!needle || `${item.term}\\n${item.sentence}\\n${item.note}`.toLocaleLowerCase().includes(needle))\n      && (source':'      (source',
 '[items, query, source, status]':'[items, source, status]',
 '新词':'New','学习中':'Learning','熟悉':'Familiar','已掌握':'Mastered',
 '未分类来源':'Uncategorized source','zh-CN':'en-GB',
 '已更新“${updated.term}”。':'Updated “${updated.term}”.',
 '当前没有可导出的生词。':'No vocabulary to export.',
 '已导出 ${chosen.length} 条生词（${format.toUpperCase()}）。':'Exported ${chosen.length} words (${format.toUpperCase()}).',
 'title="生词本"':'title="Vocabulary"','保留选词时的原句和来源；释义不会由 AI 自动写入。':'Words, source context, and your own notes.',
 '生词筛选与导出':'Vocabulary filters and export','来源筛选':'Source filter','全部来源':'All sources',
 '掌握状态筛选':'Learning state filter','全部状态':'All states','{filtered.length} 条':'{filtered.length} entries',
 '批量导出':'Export vocabulary','正在读取生词本…':'Loading vocabulary…','还没有符合条件的生词':'No matching words yet',
 '在 Reading 正文中选中英文单词或短语，点击“加入生词本”。':'Select a word or phrase while reading, then choose Add to vocabulary.',
 '生词列表':'Vocabulary list','<span>选择</span>':'<span>Select</span>','<span>生词</span>':'<span>Word</span>',
 '<span>原句</span>':'<span>Sentence</span>','<span>来源</span>':'<span>Source</span>','<span>标记时间</span>':'<span>Added</span>',
 '<span>掌握状态</span>':'<span>State</span>','选择 ${item.term}':'Select ${item.term}',
 '${item.term} 的掌握状态':'Learning state for ${item.term}','"收起" : "展开"':'"Collapse" : "Expand"',
 '<dt>原句</dt>':'<dt>Sentence</dt>','<dt>前后文</dt>':'<dt>Context</dt>','<dt>来源</dt>':'<dt>Source</dt>',
 '未保存':'Not saved','我的备注':'Definition / my notes','补充搭配、用法或复习提示':'Add your definition, collocations, or review notes',
 '回到原文':'Return to source','删除生词“${item.term}”？':'Delete “${item.term}”?','/>删除</button>':'/>Delete</button>'
}.items()))
p=Path('src/features/vocabulary/VocabularyPage.tsx')
p.write_text('\n'.join(line for line in p.read_text(encoding='utf-8').split('\n') if 'className="vocabulary-search"' not in line),encoding='utf-8')
