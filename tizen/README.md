# GouziTV 三星电视 App（Tizen）

一个很小的 Tizen 应用：在电视「应用」里放一个 GouziTV 图标，打开后全屏进入你的 GouziTV 网站。

App 默认直接打开 `https://gouzi-tv.vercel.app`，不需要输入网址。
想改成别的网址：打开 App 后立即按遥控器 **红色 (A) 键**（改过的网址保存在电视上，重装后恢复默认）。

## 一次性准备

1. **安装 Tizen Studio**（https://developer.tizen.org/development/tizen-studio/download ）
   - 安装到 `C:\tizen-studio`
   - 打开 Package Manager →「Extension SDK」→ 安装 **Samsung Certificate Extension** 和 **TV Extensions**
2. **电视开启开发者模式**
   - 电视和电脑连同一个网络；在电脑上运行 `ipconfig` 记下 IPv4 地址
   - 电视打开「应用」页面 → 用遥控器数字键依次按 `1 2 3 4 5`
   - 打开 Developer mode，填电脑的 IP → 确定 → **重启电视**（长按电源键）
   - 在电视 设置 → 常规 → 网络 → 网络状态 → IP 设置 里记下电视 IP
3. **创建三星证书**
   - Tizen Studio → Tools → Certificate Manager → `+` → **Samsung** → TV
   - 证书配置名填 **GouziTV**，用三星账号登录
   - 先连接电视（Device Manager → Remote Device Manager → 添加电视 IP），再建 Distributor 证书，
     这样电视的 DUID 会自动加入证书

## 安装 / 更新

```powershell
.\tizen\install.ps1 -TvIp 192.168.1.50
```

## 注意

- 开发者模式安装的 App 可能在约 30 天后或电视固件更新后失效，重新运行上面的命令即可。
- 遥控器：方向键在海报/剧集之间移动，OK 键打开，返回键后退。
