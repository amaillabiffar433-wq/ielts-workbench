# 本地壁纸接口

当前只提供深灰蓝／灰紫／暗红的静态氛围底色，没有内置或下载火影角色图片。

放入自己拥有使用权的 `background.webp` 后，将 `src/styles/wallpaper.css` 中唯一的 `--app-wallpaper: none` 改为：

```css
--app-wallpaper: url("../assets/themes/uchiha/background.webp");
```

重新构建即可离线打包。更换图片只需改这一处；不要在页面组件中分别引用。也可调整同处的 `--wallpaper-position`。不要提交无传播授权的图片。

遮罩、轻微降饱和与模糊只作用于背景；正文始终使用不透明纸张面板。现有 light/dark/system 影响内容配色，不改变数据或工作区。本次不增加动态壁纸、网络请求或复杂主题引擎。
