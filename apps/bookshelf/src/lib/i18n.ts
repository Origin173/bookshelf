import { cookies, headers } from "next/headers";
import { cache } from "react";

export const LOCALE_COOKIE = "bookshelf_language";
const en = {
  upload: "Upload a book",
  import: "Add to shelf",
  title: "Title",
  author: "Author (optional)",
  file: "Book file",
  uploadHelp:
    "One EPUB or PDF, up to 8 MiB. Use the publishing tool for larger files.",
  uploaded: "Book added to the shelf.",
  duplicate: "This file is already on the shelf.",
  invalidFile: "Select a supported EPUB or PDF file.",
  invalidDetails:
    "Enter a title. Title and author may each have up to 200 characters.",
  tooLarge: "This file exceeds the 8 MiB web upload limit.",
  uploadConflict:
    "Another upload is being saved. Select the file and try again.",
  loginTitle: "Sign in to Bookshelf",
  signIn: "Sign in",
  signOut: "Sign out",
  username: "Username",
  password: "Password",
  loginLimited: "Too many attempts. Try again later.",
  loginInvalid: "Incorrect username or password.",
  loginHelp:
    "Use the same account when adding this OPDS library to your reading app.",
  shelf: "Shelf",
  manage: "Manage books",
  subjects: "Subjects",
  allSubjects: "All subjects",
  filter: "Filter",
  edit: "Edit subjects",
  subjectHelp:
    "Enter one subject per line, up to 20 subjects of 80 characters each.",
  save: "Save",
  reset: "Use published subjects",
  saved: "Subjects saved.",
  invalid: "Check the number and length of the subjects.",
  conflict:
    "The catalog changed. Review the current subjects before saving again.",
  missing: "This book is no longer in the catalog.",
  unavailable: "The library is unreachable.",
  retry: "Try again",
  empty: "No books have been published yet.",
  read: "Read",
  resume: "Continue",
  search: "Search books",
  searching: "Searching…",
  noMatches: "No matching books.",
  noProfile: "Reading positions are temporarily unavailable.",
  shelfError: "Your shelf could not be loaded. Try again in a moment.",
};

const zh: typeof en = {
  upload: "上传图书",
  import: "加入书架",
  title: "书名",
  author: "作者（可选）",
  file: "图书文件",
  uploadHelp:
    "每次可上传一个 EPUB 或 PDF，最大 8 MiB。较大的文件请通过发布工具导入。",
  uploaded: "图书已加入书架。",
  duplicate: "书架中已有这个文件。",
  invalidFile: "请选择支持的 EPUB 或 PDF 文件。",
  invalidDetails: "请填写书名。书名和作者各限 200 个字符。",
  tooLarge: "文件超过网页上传的 8 MiB 上限。",
  uploadConflict: "另一份上传正在保存。请重新选择文件并重试。",
  loginTitle: "登录书架",
  signIn: "登录",
  signOut: "退出登录",
  username: "用户名",
  password: "密码",
  loginLimited: "登录尝试过多，请稍后重试。",
  loginInvalid: "用户名或密码不正确。",
  loginHelp: "在阅读器中添加 OPDS 书库时，使用此处的用户名和密码。",
  shelf: "书架",
  manage: "管理书目",
  subjects: "主题",
  allSubjects: "全部主题",
  filter: "筛选",
  edit: "编辑主题",
  subjectHelp: "每行填写一个主题，最多 20 个，每个最多 80 个字符。",
  save: "保存",
  reset: "恢复出版物主题",
  saved: "主题已保存。",
  invalid: "请检查主题数量和长度。",
  conflict: "书目已更新，请核对当前主题后重新保存。",
  missing: "书目中已没有这本书。",
  unavailable: "暂时无法访问书库。",
  retry: "重试",
  empty: "尚未发布图书。",
  read: "阅读",
  resume: "继续阅读",
  search: "搜索图书",
  searching: "正在搜索…",
  noMatches: "没有符合条件的图书。",
  noProfile: "暂时无法读取阅读进度。",
  shelfError: "书架暂时无法加载，请稍后重试。",
};

export const language = cache(async () => {
  const preferred = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (preferred === "en" || preferred === "zh-CN") return preferred;
  const languages = ((await headers()).get("accept-language") ?? "")
    .toLowerCase()
    .split(",")
    .map((range) => {
      const [tag, weight] = range.trim().split(/\s*;\s*q=/);
      return {
        tag: tag.split("-")[0],
        quality: weight === undefined ? 1 : Number(weight),
      };
    })
    .filter(
      ({ tag, quality }) =>
        (tag === "en" || tag === "zh") && quality > 0 && quality <= 1,
    )
    .sort((a, b) => b.quality - a.quality);
  return languages[0]?.tag === "zh" ? "zh-CN" : "en";
});

export async function messages() {
  return (await language()) === "zh-CN" ? zh : en;
}
