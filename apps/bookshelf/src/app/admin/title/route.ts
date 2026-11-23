import { updateBook } from "@/app/admin/update-book";

export function POST(request: Request) {
  return updateBook(request, "title");
}
