# 照片档案

一个可以按编号查看、放大和分享照片的静态网站，由 GitHub 保存代码和图片，GitHub Actions 自动发布到 GitHub Pages。

- 网站：[xq182.github.io/photo-gallery](https://xq182.github.io/photo-gallery/)
- 仓库：[xq182/photo-gallery](https://github.com/xq182/photo-gallery)
- 发布记录：[Actions](https://github.com/xq182/photo-gallery/actions/workflows/pages.yml)

**网站和仓库均公开。** 首批照片从本机“文稿”目录读取，仅上传用于网站展示的压缩 WebP。原始照片保留在本地，处理过程不会修改它们。网站没有登录、数据库或第三方统计。

## 照片编号

照片从 `001` 开始编号。`photo-manifest.json` 保存照片与编号的对应关系及下一个可用编号，`public/photos.json` 供网页读取。已有编号会保留，新增照片接着分配编号，移除的编号也不会重新分配。不要删除或整体重新生成编号清单，也不要减小其中的 `next_id`。

文件名相同的照片视为更新，保留原编号；重命名但内容相同的照片会尽量匹配已有编号。同一次导入中的多个文件各有独立编号，即使照片内容重复也会保留。给新照片使用不同文件名，避免把它误当作旧照片的替换版本。

首次导入的原始照片没有放进仓库，所以 `source/` 默认只有占位文件；后续构建会继续使用仓库里的压缩图片，不会因为缺少原始照片而清空相册。

## 在 GitHub 上添加照片

1. 打开仓库的 [`source/` 目录](https://github.com/xq182/photo-gallery/tree/main/source)。
2. 选择 **Add file → Upload files**，上传准备公开的新照片，提交到 `main`。使用容易区分的文件名。
3. 打开 **Actions → 发布照片网站** 查看进度。工作流会生成编号及 WebP，把编号清单和生成的图片自动保存回仓库，再发布网站。
4. 工作流完成后刷新网站。若浏览器仍显示旧页面，强制刷新。

支持 PNG、JPG/JPEG、WebP、BMP、TIF/TIFF。照片需直接放在 `source/` 中，脚本不读取子文件夹；HEIC 请先转为 JPG 或 PNG。

通过这个入口上传的文件本身也会保留在公开仓库中。若只想上传压缩图片，请使用下面的本地导入方式。

## 更新已有照片

用同样的文件名重新上传到 `source/`，下一轮构建会替换对应照片并保留编号。首次导入照片的原始文件名可在 `photo-manifest.json` 对应编号的 `original_filename` 中查看。文件未变且网页资源齐全时，脚本会直接复用已有 WebP。

如果照片原本就在 `source/` 中，本地替换时也要更新这个源文件；否则下次自动构建仍会读取仓库中的旧版本。删除 `source/` 中的文件只会停止读取该源文件，已发布的照片仍保留。

如需下架某张照片，在本地一次性移除 `photo-manifest.json` 中对应的照片条目、`public/photos/编号.webp` 和 `public/photos/编号-thumb.webp`，并移除 `source/` 中对应的源文件（若有）。保留 `next_id` 不变，运行下面的构建命令后，把这些删除和生成的 `public/photos.json` 一起提交。下架只影响当前网站，公开仓库的历史提交仍保留旧文件。

```bash
python scripts/prepare_photos.py --source source
```

## 本地导入和预览

需要 Python 3.12 或更新版本。在项目目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

每次更新前先同步 GitHub 自动保存的编号：

```bash
git pull --ff-only
```

从仓库外的照片目录导入，原图不会被复制到仓库：

```bash
python scripts/prepare_photos.py --source /绝对路径/新照片目录
```

在本地浏览器预览：

```bash
python -m http.server 8000 --directory public
```

打开 [localhost:8000](http://localhost:8000)。完成确认后，提交并推送生成的编号和网页图片：

```bash
git add photo-manifest.json public/photos.json public/photos
git commit -m "添加照片"
git push origin main
```

如果同时修改了网站界面，请另外提交相应的 `public/index.html`、`public/styles.css` 或 `public/app.js`。无需安装前端构建工具。

## 自动发布与运维

GitHub 仓库 **Settings → Pages → Build and deployment → Source** 应选择 **GitHub Actions**。推送 `main` 或在 Actions 页面点击 **Run workflow** 都会发布网站。

工作流先构建并持久保存 `photo-manifest.json`、`public/photos.json`、`public/photos/`，再只将 `public/` 部署到 Pages。编号写回使用仓库自带的 `GITHUB_TOKEN`，无需额外密钥；该提交不会再次触发 push 工作流，所以不会循环发布。

构建任务需要 `contents: write` 权限，写回操作仅暂存上述三个路径；部署任务单独使用 `pages: write` 和 `id-token: write`。如果以后给 `main` 添加分支保护，请允许这项自动写回，或改用本地导入并提交产物的流程。

多次发布串行处理。若用户恰好在构建期间推送了新提交，自动写回可能失败；工作流会停止，不会强行覆盖 `main`。等待最新一次任务完成，或在 Actions 重跑最新一次任务即可。已经显示的编号只会在成功保存到仓库后发布。

如果网站显示 404，检查最近一次 Actions 是否成功，以及 Pages 的来源是否为 GitHub Actions。GitHub Pages 发布可能需要几分钟生效。

## 文件说明

| 路径 | 用途 |
| --- | --- |
| `public/index.html`、`public/styles.css`、`public/app.js` | 可编辑的网站界面 |
| `public/photos/` | 压缩后的展示图与缩略图 |
| `public/photos.json` | 网页读取的照片数据 |
| `photo-manifest.json` | 持久保存的编号对应表 |
| `source/` | 后续通过 GitHub 上传的照片 |
| `scripts/prepare_photos.py` | 导入照片和生成资源 |
| `.github/workflows/pages.yml` | 自动构建、编号写回和发布 |

部署方案参考 [GitHub Pages 官方工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)及 [GITHUB_TOKEN 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。
