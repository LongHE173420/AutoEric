# Log Event Map

Tai lieu nay tong hop cac event log hien tai cua du an, de nhin log la biet no dang o stage nao, dang lam gi, va log duoc phat ra tu file nao.

## 1. Vi tri log

- Log app:
  - `data/logs/login-worker-YYYY-MM-DD.log`
- Log PM2 tren server:
  - `~/.pm2/logs/auto-eric-out-*.log`
  - `~/.pm2/logs/auto-eric-error-*.log`

## 2. Quy uoc chung

- `OK: <MissionName>`: action/API do thanh cong.
- `MISSION_IGNORED (<status>): <MissionName>`: backend bo qua, bot khong danh fail ca flow.
- `MISSION_FAILED (<status>): <MissionName>`: loi that o request do.
- `MISSION_STAGE_START`: bat dau 1 stage lon.
- `MISSION_STAGE_DONE`: ket thuc 1 stage lon.
- `MISSION_STAGE_ERROR`: stage lon bi vang loi.

## 3. Khung job va account

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `Service_CONFIG` | Startup | In config runtime khi service khoi dong | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |
| `JOB_START` | Startup / Interval | Bat dau 1 vong job | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |
| `JOB_DONE` | Ket thuc job | Tong hop ket qua sau khi chay xong | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |
| `JOB_CRASH` | Loi tong | Job chet truoc khi chay xong | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |
| `ACCOUNTS_PAGE_LOADED` | Load account | Da load 1 page account tu DB | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |
| `ACCOUNT_EXECUTION_PLAN` | Batch | Ke hoach chay batch account | [src/com/nasa/worker/MasterWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/MasterWorker.ts) |
| `ACCOUNT_BATCH_START` | Batch | Bat dau 1 batch account | [src/com/nasa/worker/MasterWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/MasterWorker.ts) |
| `ACCOUNT_BATCH_DONE` | Batch | Ket thuc 1 batch account | [src/com/nasa/worker/MasterWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/MasterWorker.ts) |
| `ACCOUNT_START` | Account | Bat dau xu ly 1 account | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `ACCOUNT_ACTIVITY_DECISION` | Policy | Quyet dinh run nay co post/surf hay khong, quota con bao nhieu | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `BOT_MISSIONS_START` | Account | Bat dau toan bo flow action/mission cua account | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `BOT_MISSIONS_COMPLETE` | Account | Ket thuc flow account | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSIONS_SYSTEM_ERROR` | Account | Loi tong khi chay missions | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `RUN_MISSIONS_FATAL_ERROR` | Account | Loi fatal cua flow mission | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `ATTEMPT_RUN_PROCESS_ERROR` | Account | Loi o 1 lan attempt chay account | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `LOGIN summary: success=...` | Account | Tong ket nhanh de nhin tren PM2 console | [service.ts](/d:/React_Native/Demo/AutoEric/src/service.ts) |

## 4. Stage wrapper

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `MISSION_STAGE_START` | Moi stage | Bat dau stage `PROFILE_AND_SOCIAL`, `FEED_AND_INTERACT`, `CREATE_VIDEO_POST`, `CREATE_SURF`, `FRIEND_MANAGEMENT`, `REWARD_CLAIMING`... | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSION_STAGE_DONE` | Moi stage | Stage chay xong | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSION_STAGE_ERROR` | Moi stage | Stage bi loi | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `OK: <name>` | Moi API/action | Request thanh cong | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSION_IGNORED (400/403/404/409): <name>` | Moi API/action | Backend tu choi/bo qua nhung khong fail toan flow | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSION_FAILED (401): <name>` | Moi API/action | Token/auth that bai | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `MISSION_FAILED (5xx): <name>` | Moi API/action | Loi server backend | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |

## 5. Profile, social, activity generation

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `OK: ProfileMe` | `PROFILE_AND_SOCIAL` | Lay thong tin profile | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `OK: MyFriends` | `PROFILE_AND_SOCIAL` | Lay danh sach ban be | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `OK: Notifications` | `PROFILE_AND_SOCIAL` | Lay notifications | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `HANDLE_PROFILE_AND_SOCIAL_ERROR` | `PROFILE_AND_SOCIAL` | Loi tong cua nhanh nay | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `OK: BackgroundColor` | `ACTIVITY_GENERATION` | Lay background color list | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `OK: ReactionList` | `ACTIVITY_GENERATION` | Lay reaction list | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |
| `HANDLE_ACTIVITY_GENERATION_ERROR` | `ACTIVITY_GENERATION` | Loi tong cua nhanh nay | [AccountMissionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionService.ts) |

## 6. Feed, reaction, comment

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `LOAD_SEEN_POST_IDS_FAILED` | Feed state | Loi doc lich su da thay | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SAVE_SEEN_POST_IDS_FAILED` | Feed state | Loi luu lich su da thay | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `LOAD_COMMENTED_POST_IDS_FAILED` | Feed state | Loi doc lich su da comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SAVE_COMMENTED_POST_IDS_FAILED` | Feed state | Loi luu lich su da comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `LOAD_REACTED_POST_IDS_FAILED` | Feed state | Loi doc lich su da react | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SAVE_REACTED_POST_IDS_FAILED` | Feed state | Loi luu lich su da react | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `EXTRACT_REACTION_CODES_ERROR` | Feed setup | Loi parse reaction codes | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `FAILED_TO_FETCH_REACTION_CODES` | Feed setup | Goi API reaction list fail, thuong se fallback `LIKE` | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `REACTION_CODES_READY` | Feed setup | Da co danh sach reaction code de dung | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OK: FeedHome_Page_<n>` | Feed | Load 1 page feed thanh cong | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OK: SurfHome` | Feed | Goi surf home phu tro | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `DEBUG_FEEDHOME` | Feed | Tong so item va so page da load | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `FEED_LIGHT_MODE_NO_DAILY_POINT` | Feed | Het point ngay, chi luot feed nhe | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `FEED_LIGHT_MODE_DONE` | Feed | Da luot feed nhe xong, khong react/comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `MISSION_ACTION_DEPENDENT_START` | Feed | Bat dau xu ly reaction/comment tren danh sach post | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `NO_POSTS_FOR_INTERACTION` | Feed | Khong co post de tuong tac | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_REACTION_ALREADY_REACTED` | Reaction | Bo qua vi da react roi | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_REACTION_OWN_POST` | Reaction | Bo qua vi la bai cua chinh minh | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `REACTION_SELECTED` | Reaction | Da chon reaction type cho bai nay | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OK: PostReaction_<postId>` | Reaction | Gui reaction thanh cong | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_COMMENT_ALREADY_COMMENTED` | Comment | Bo qua vi da comment roi | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_COMMENT_OWN_POST` | Comment | Bo qua vi la bai cua chinh minh | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_COMMENT_NO_CONTENT` | Comment | Bai khong co noi dung text phu hop de comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OPENAI_COMMENT_DISABLED` | Comment AI | Chua bat OpenAI hoac thieu key | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OPENAI_COMMENT_GENERATED` | Comment AI | OpenAI da sinh comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OPENAI_COMMENT_EMPTY_RESPONSE` | Comment AI | OpenAI tra ve rong | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OPENAI_COMMENT_GENERATION_FAILED` | Comment AI | Goi OpenAI fail | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `SKIP_COMMENT_NO_OPENAI_OUTPUT` | Comment AI | Khong co output dung de gui comment | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `OK: PostComment_<postId>` | Comment | Gui comment thanh cong | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |
| `INTERACT_WITH_POSTS_ERROR` | Feed | Loi tong cua nhanh interaction | [InteractionService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/InteractionService.ts) |

## 7. Post

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `CREATE_VIDEO_POST_SKIPPED_BY_RANDOM` | Policy | Run nay random khong dang post | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `VIDEO_POST_START` | Post | Bat dau xu ly 1 video de dang | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `BROKEN_VIDEO_RETRY_NEXT` | Post | Video loi local, bo qua va thu video tiep theo | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_TOO_LARGE_SKIPPING` | Post | Video vuot gioi han kich thuoc | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_THUMBNAIL_CREATED_DEBUG` | Post | Da tao thumbnail local | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_POST_ID_GENERATED` | Post | Backend da cap `postId` | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_UPLOAD_REQUEST_PREPARED` | Post | Da chuan bi metadata upload/complete | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_POST_COMPLETE_REQUEST` | Post | Sap goi `/api/posts/complete` | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_POST_COMPLETE_RESPONSE` | Post | Backend tra response complete | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_POST_SUCCESS` | Post | Dang post thanh cong | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `SOURCE_VIDEO_DELETED_AFTER_POST` | Post | Xoa file local sau khi dang xong | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `ACCOUNT_DAILY_POST_RECORDED` | Post counter | Da cong `daily_post_count` trong DB | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `NO_VIDEO_AVAILABLE_SKIP_POST` | Post | Khong co video nao de dang | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `NORMALIZE_TEXT_ERROR` | Post | Loi normalize text payload | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `CREATE_POST_CONTENT_ERROR` | Post | Loi tao chuoi `content` cho post | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `HANDLE_AUTO_CREATE_POST_ERROR` | Post | Loi tong cua nhanh post | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |

## 8. Surf

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `CREATE_SURF_SKIPPED_BY_RANDOM` | Policy | Run nay random khong dang surf | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `SURF_VIDEO_START` | Surf | Bat dau xu ly 1 video de dang surf | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `BROKEN_SURF_VIDEO_RETRY_NEXT` | Surf | Video surf loi local, thu video khac | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SURF_THUMBNAIL_CREATED_DEBUG` | Surf | Da tao thumbnail local | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SURF_ID_GENERATED` | Surf | Backend da cap `surfId` | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SURF_COMPLETE_REQUEST` | Surf | Sap goi `/api/surf/complete` | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SURF_COMPLETE_RESPONSE` | Surf | Backend tra response complete | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SOURCE_SURF_VIDEO_DELETED_AFTER_POST` | Surf | Xoa file local sau khi surf xong | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `ACCOUNT_DAILY_SURF_RECORDED` | Surf counter | Da cong `daily_surf_count` trong DB | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `NO_SURF_VIDEO_AVAILABLE_SKIP` | Surf | Khong co video de dang surf | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `RUN_SEQUENTIAL_SURF_ERROR` | Surf | Loi queue xu ly surf tuan tu | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `BUILD_SURF_PAYLOAD_ERROR` | Surf | Loi tao payload complete surf | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `HANDLE_AUTO_CREATE_SURF_ERROR` | Surf | Loi tong cua nhanh surf | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |

## 9. Friend management

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `OK: GetReceivedFriendRequests` | Friend | Lay danh sach request nhan duoc | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `OK: AcceptFriend_<senderId>` | Friend | Accept friend request thanh cong | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `MISSION_IGNORED (409): AcceptFriend_<senderId>` | Friend | Request da o trang thai conflict, thuong la da xu ly roi | [EricWorker.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/worker/EricWorker.ts) |
| `INTERNAL_FRIEND_TARGETS_FOUND` | Friend | Tim thay account noi bo de gui ket ban | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `NO_INTERNAL_FRIEND_TARGETS` | Friend | Khong co target noi bo de gui ket ban | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `OK: SendInternalFriendRequest_<receiverPhone>` | Friend | Gui friend request noi bo thanh cong | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `FETCH_FRIEND_TARGETS_ERROR` | Friend | Loi luc lay target tu DB | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |
| `HANDLE_FRIEND_MANAGEMENT_ERROR` | Friend | Loi tong cua nhanh friend | [RelationService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/RelationService.ts) |

## 10. Reward claiming cuoi stage

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `OK: PointBalance` | Reward | Da lay point balance | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `DAILY_LIMIT_REACHED_SKIP_CLAIMS` | Reward | Da dat 3 point/ngay, bo qua claim | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `OK: Missions` | Reward | Da lay mission list | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `MISSION_LIST_FETCHED` | Reward | Mission list fetch xong, co `phase` va `missionCount` | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `MISSION_LIST_DETAIL` | Reward debug | Tom tat chi tiet cac mission | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `MISSION_18_RAW` | Reward debug | Log raw cua mission streak login | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `STREAK_MISSION_REWARD_CLAIM_REQUEST` | Reward | Sap claim streak login | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `MISSION_REWARD_CLAIM_REQUEST` | Reward | Sap claim mission thuong | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `SKIP_STREAK_MISSION_<id>` | Reward debug | Streak chua claim duoc hoac da claim hom nay | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `SKIP_NON_STREAK_MISSION_IN_REWARD_STAGE_<id>` | Reward debug | Mission thuong chua du dieu kien khi quet cuoi stage | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `SKIP_MISSION_CLAIM_DAILY_LIMIT_<id>` | Reward debug | Bo qua claim vi het quota point ngay | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `MISSION_PROCESSING_ERROR` | Reward | Loi khi xu ly mission list | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `CLAIM_ALL_MISSIONS_ERROR` | Reward | Loi khi quet va claim mission | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |
| `HANDLE_REWARD_CLAIMING_ERROR` | Reward | Loi tong cua nhanh reward claiming | [AccountMissionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountMissionRewardService.ts) |

## 11. Auto claim sau tung action

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `AUTO_MISSION_REWARD_SKIPPED_CACHED_NO_DAILY_POINT` | Action reward | Cache biet da het point ngay, bo claim ngay | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_CANDIDATE` | Action reward | Tim thay mission ung voi action vua lam | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_LIMIT_REACHED` | Action reward | Quota local claim cua category/scope da het | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_SKIPPED_NO_DAILY_POINT` | Action reward | Check backend xong thay het point ngay | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_ATTEMPT_CLAIM` | Action reward | Sap claim reward cho action vua xay ra | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `MISSION_REWARD_CLAIM_REQUEST` | Action reward | Log request claim mission thuong | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_CLAIMED` | Action reward | Claim sau action thanh cong | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `AUTO_MISSION_REWARD_NO_CANDIDATE` | Action reward | Khong co mission backend tuong ung | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |
| `HANDLE_ACTION_REWARD_CLAIM_ERROR` | Action reward | Loi tong cua nhanh auto-claim | [AccountActionRewardService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/missions/AccountActionRewardService.ts) |

## 12. Upload media phu tro

`<LABEL>` trong cac event duoi day thuong se la `VIDEO_THUMBNAIL`, `VIDEO_FILE`, `SURF_THUMBNAIL`, hoac `SURF_FILE`.

| Event | Stage / Nhanh | Y nghia | File phat sinh |
| --- | --- | --- | --- |
| `<LABEL>_PRESIGNED_REQUEST` | Upload | Xin presigned URL | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_PRESIGNED_RESPONSE` | Upload | Nhan presigned URL va fields | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_PRESIGNED_REQUEST_FAILED` | Upload | Loi xin presigned URL | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_PRESIGNED_MISSING_URL` | Upload | Response khong co URL upload | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_S3_UPLOAD_SUCCESS` | Upload | Upload len S3 thanh cong | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_S3_UPLOAD_FAILED` | Upload | Upload len S3 that bai | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_DIRECT_UPLOAD_REQUEST` | Upload | Bat dau upload direct | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_DIRECT_UPLOAD_SUCCESS` | Upload | Upload direct thanh cong | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<LABEL>_DIRECT_UPLOAD_FAILED` | Upload | Upload direct that bai | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `VIDEO_THUMBNAIL_UPLOAD_MODE_FALLBACK` | Upload | Thumbnail post fail presigned, chuyen sang direct | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `VIDEO_THUMBNAIL_UPLOAD_SKIPPED_AFTER_FAILURE` | Upload | Fail ca presigned va direct cho thumbnail post | [PostService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/PostService.ts) |
| `SURF_THUMBNAIL_UPLOAD_SKIPPED_AFTER_FAILURE` | Upload | Thumbnail surf fail va bi bo qua | [SurfService.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/service/action/SurfService.ts) |
| `SCENE_DETECTION_FAILED` | Upload | Loi tim frame thumbnail theo scene | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `THUMBNAIL_SANITIZE_FAILED` | Upload | Loi clean JPEG thumbnail | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<PREFIX>_FILE_DELETE_FAILED` | Upload cleanup | Xoa file local loi that bai | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<PREFIX>_DB_DELETE_FAILED` | Upload cleanup | Xoa queue DB that bai | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |
| `<PREFIX>_REMOVED` | Upload cleanup | Da loai video loi khoi he thong | [MediaHelper.ts](/d:/React_Native/Demo/AutoEric/src/com/nasa/utils/MediaHelper.ts) |

## 13. Cach doc nhanh mot run

1. Tim `ACCOUNT_START` de biet account nao dang chay.
2. Tim `ACCOUNT_ACTIVITY_DECISION` de biet run nay co duoc post/surf khong.
3. Tim `MISSION_STAGE_START` va `MISSION_STAGE_DONE` de biet dang o stage nao.
4. Neu can feed, tim `FEED_LIGHT_MODE_NO_DAILY_POINT`, `REACTION_SELECTED`, `OK: PostReaction_<postId>`, `OK: PostComment_<postId>`.
5. Neu can post, tim `VIDEO_POST_START`, `VIDEO_POST_COMPLETE_REQUEST`, `VIDEO_POST_COMPLETE_RESPONSE`, `VIDEO_POST_SUCCESS`.
6. Neu can surf, tim `SURF_VIDEO_START`, `SURF_COMPLETE_REQUEST`, `SURF_COMPLETE_RESPONSE`.
7. Neu can friend, tim `OK: GetReceivedFriendRequests`, `INTERNAL_FRIEND_TARGETS_FOUND`, `OK: SendInternalFriendRequest_<receiverPhone>`.
8. Tim `JOB_SUMMARY` hoac `LOGIN summary: ...` de biet ket qua cuoi cung.
