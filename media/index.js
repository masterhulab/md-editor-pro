import { imageParser, scrollEditor, openLink } from "./js/util.js";
import { toolbar } from "./js/toolbar.js";
const init = () => {
  window.handler
    .on("open", ({ title, content, language, scrollTop, rootPath, config }) => {
      const isDark = window.localStorage.getItem("dark") !== "false";
      const editMode = window.localStorage.getItem("edit-mode") || "ir";
      // 是否显示大纲
      const showOutline = window.localStorage.getItem("outline") === 'true';

      let lastKeydown = "";
      const vditor = new Vditor("vditor", {
        value: content,
        toolbar,
        cdn: `${rootPath}/cdn/vditor`,
        height: "100%",
        lang: language === "zh-cn" ? "zh_CN" : "en_US",
        width: "100%",
        cache: {
          enable: false,
        },
        undoDelay: 200,
        icon: "material",
        tab: config && config.tab ? config.tab : "  ",
        mode: editMode,
        theme: isDark ? "dark" : "classic",
        preview: {
          theme: {
            current: isDark ? "dark" : "light",
            path: `${rootPath}/cdn/vditor/dist/css/content-theme`,
          },
          markdown: {
            toc: true,
            codeBlockPreview: true,
            autoSpace: true,
            fixTermTypo: true,
          },
          hljs: {
            lineNumber: config && config.lineNumbers !== undefined ? config.lineNumbers : true,
            style: isDark ? "github-dark" : "github",
          },
          extPath: rootPath,
          math: {
            engine: config && config.mathEngine ? config.mathEngine : "KaTeX",
            inlineDigit: true,
          },
        },
        extPath: rootPath,
        hint: {
          emojiPath: `${rootPath}/cdn/vditor/dist/images/emoji`,
        },
        outline: {
          enable: showOutline,
          position: 'left',
        },
        resize: {
          enable: true,
        },
        typewriterMode: true,
        keydown: (e) => {
          if (!isCompose(e)) {
            return;
          }
          // 修复剪切失效问题
          if (e.code === "KeyX" && lastKeydown === "MetaLeft") {
            setTimeout(() => {
              vditor.deleteValue();
            }, 10);
          }
          lastKeydown = e.code;
        },
        input(content) {
          window.handler.emit("change", content);
        },
        upload: {
          url: "/image",
          accept: "image/*",
          handler(files) {
            let reader = new FileReader();
            reader.readAsBinaryString(files[0]);
            reader.onloadend = () => {
              const placeholder = `![uploading-${new Date().getTime()}]()`;
              vditor.insertValue(placeholder);
              
              // Wait for Vditor to update the value
              setTimeout(() => {
                  const content = vditor.getValue();
                  const index = content.indexOf(placeholder);
                  
                  // Fallback if placeholder not found (shouldn't happen with timeout)
                  if (index === -1) {
                       console.error("Placeholder not found in content");
                       window.handler.emit("img", { 
                         data: reader.result, 
                         placeholder
                       });
                       return;
                  }

                   window.handler.emit("img", { 
                     data: reader.result, 
                     placeholder
                   });
              }, 50); // 50ms delay
            };
          },
        },
        after: () => {
          openLink();
          scrollEditor(scrollTop);
          zoomElement(".vditor-content");

          // vditor create and init thing
          imageParser();
          window.handler.on("insertValue", (val) => {
            vditor.insertValue(val);
          });
          window.handler.on("replaceValue", ({ oldVal, newVal }) => {
             const content = vditor.getValue();
             vditor.setValue(content.replace(oldVal, newVal));
          });
          window.handler.on("setValue", (val) => {
            vditor.setValue(val);
          });
          // vditor.setTheme('dark', 'dark', 'native');
          // document.querySelector('body').style.backgroundColor='#2f363d';
        },
      });
      window.vditor = vditor;
    })
    .emit("init");
};
init();
