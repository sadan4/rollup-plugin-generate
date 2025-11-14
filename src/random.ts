import { customAlphabet } from "nanoid";

export const makeRandomId = customAlphabet("abcdefghijklmnopqrstuvwxyz_$", 10);