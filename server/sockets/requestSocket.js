const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const OneToOneMessage = require("../models/OneToOneMessage");

const requestSocket = (io, socket) => {
  socket.on("send_friend_request", async (data, callback) => {
    try {
      // Ensure that both users exist before proceeding
      const toUser = await User.findById(data.to, {
        socket_id: true,
        username: true,
      });
      const fromUser = await User.findById(data.from, {
        socket_id: true,
        username: true,
      });

      if (!toUser || !fromUser) {
        return callback({ isSent: false, message: "User not found" });
      }

      // Create a new friend request
      const newRequest = await FriendRequest.create({
        sender: data.from,
        recipient: data.to,
      });

      await newRequest.save();

      if (newRequest) {
        callback({ isSent: true });

        // Emit a notification to the sender about the new friend request
        io.to(fromUser.socket_id).emit("friend_request_received", {
          severity: "info",
          message: "New friend request received",
        });

        // Optionally, emit to the recipient if necessary
        io.to(toUser.socket_id).emit("friend_request_received", {
          severity: "info",
          message: "You have a new friend request",
        });
      } else {
        callback({ isSent: false });
      }
    } catch (error) {
      console.error("Error in send_friend_request:", error);
      callback({ isSent: false, message: "Failed to send friend request" });
    }
  });

  socket.on("accept_friend_request", async (data) => {
    try {
      const request = await FriendRequest.findById(data.requestId);

      if (!request) {
        return io.to(socket.id).emit("error", {
          severity: "error",
          message: "Friend request not found",
        });
      }

      const sender = await User.findById(request.sender);
      const recipient = await User.findById(request.recipient);

      if (!sender || !recipient) {
        return io.to(socket.id).emit("error", {
          severity: "error",
          message: "Sender or recipient not found",
        });
      }

      // Add friends to each other
      sender.friends.push(request.recipient);
      recipient.friends.push(request.sender);

      await sender.save();
      await recipient.save();

      // Create a new chat between the two friends
      const newChat = await OneToOneMessage.create({
        participants: [sender._id, recipient._id],
      });

      await newChat.save();

      // Delete the friend request
      await FriendRequest.findByIdAndDelete(data.requestId);

      // Emit success messages to both users
      io.to(sender.socket_id).emit("friend_request_accepted", {
        severity: "success",
        message: "Friend request accepted",
      });

      io.to(recipient.socket_id).emit("friend_request_accepted", {
        severity: "success",
        message: "Friend request accepted",
      });
    } catch (error) {
      console.error("Error in accept_friend_request:", error);
      io.to(socket.id).emit("error", {
        severity: "error",
        message: "Failed to accept friend request",
      });
    }
  });
};

module.exports = requestSocket;
