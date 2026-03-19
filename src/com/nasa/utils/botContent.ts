export const COMMENT_TEXTS = [
    "Bài viết tuyệt vời quá!",
    "Chúc bạn một ngày vui vẻ nha ❤️",
    "Quá đỉnh luôn",
    "Rất ý nghĩa!",
    "Thả tim cho status này nha",
    "Hihi đẹp quá",
    "Lên là lên là lên",
    "Đồng ý kiến!",
    "Cho mình xin info nha"
];

export const STATUS_TEXTS = [
    "Chào buổi sáng nha mọi người!",
    "Chúc cả nhà một ngày vui vẻ ❤️",
    "Hôm nay thời tiết đẹp quá!",
    "Có ai đang rảnh không, cafe nhé?",
    "Lâu rồi mới ngoi lên mạng xã hội tí...",
    "Đang suy nghĩ mông lung quá...",
    "Cuối tuần này có ai đi chơi hơm?",
    "Tự nhiên thèm ly trà sữa ghê huhu",
    "Công việc thật sự áp lực nhưng sẽ cố gắng!"
];

export const REACTION_TYPES = ["WOW", "ANGRY", "BORED", "SMILE", "SAD", "FUNNY", "LIKE", "EMPATHETIC"];

export function getRandomComment(): string {
    return COMMENT_TEXTS[Math.floor(Math.random() * COMMENT_TEXTS.length)];
}

export function getRandomStatus(): string {
    return STATUS_TEXTS[Math.floor(Math.random() * STATUS_TEXTS.length)];
}

export function getRandomReaction(): string {
    return REACTION_TYPES[Math.floor(Math.random() * REACTION_TYPES.length)];
}
