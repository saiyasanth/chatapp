const User = require("../models/User");
const { hash, compare } = require("bcrypt");
const verificationSuccessHtml = require("../views/verificationSuccessHtml");
const { sendEmail, sendResetPasswordEmail } = require("../helper/sendEmail");
const { createToken, verifyToken } = require("../helper/token");

const JWT_SECRET = process.env.JWT_SECRET;

const signup = async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.json({
            severity: "error",
            message: "username, email, and password are required"
        });
    }

    // Check if email already exists
    let user = await User.findOne({ email }, { email: true });
    if (user) {
        return res.json({
            severity: "error",
            message: "Account already exists"
        });
    }

    // Hash the password
    const hashPassword = await hash(password, 10);

    // Create new user
    const newUser = await User.create({ username, email, password: hashPassword });
    console.log("User created with ID:", newUser._id);  // Debugging log

    // Generate verification token
    const { _id } = newUser;
    const token = createToken(_id);

    // Send verification email
    let isSent;
    try {
        isSent = await sendEmail(email, token);
        console.log("Email sent status:", isSent);  // Debugging log
    } catch (error) {
        console.error("Error in sendEmail:", error);  // Debugging log
        isSent = false;
    }

    if (!isSent) {    
        await User.findByIdAndDelete(_id);
        console.log("User deleted due to email failure:", _id);  // Debugging log
        return res.json({
            severity: "error",
            message: "Issue in creating your account. Please try again later."
        });
    }

    res.json({
        severity: "info",
        message: "Account has been created successfully. Please verify your email." 
    });
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({
            severity: "error",
            message: "Email and password are required"
        });
    }

    const user = await User.findOne({ email });
    if (!user) {
        return res.json({
            severity: "error",
            message: "Account does not exist"
        });
    }

    if (!await compare(password, user.password)) {
        return res.json({
            severity: "error",
            message: "Incorrect password"
        });
    }

    const { _id } = user;
    const token = createToken(_id);

    if (!user.isVerified) {
        await sendEmail(user.email, token);
        return res.json({
            severity: "error",
            message: "Account is not verified. Verification email resent."
        });
    }

    res.cookie("token", token, { expires: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), httpOnly: true })
       .json({
           severity: "success",
           message: "Logged in successfully",
           _id
       });
};

const forgetPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.json({
            severity: "error",
            message: "Email is required"
        });
    }

    const user = await User.findOne({ email }, { email: true });

    if (!user) {
        return res.json({
            severity: "error",
            message: "Account does not exist"
        });
    }

    const { _id } = user;
    const token = createToken(_id);

    const isSent = await sendResetPasswordEmail(email, token);
    if (!isSent) {
        return res.json({
            severity: "error",
            message: "Issue in sending email, please try again later."
        });
    }

    res.json({
        severity: "info",
        message: "Email has been sent to reset the password"
    });
};

const resetPassword = async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.json({
            severity: "error",
            message: "Token and new password are required"
        });
    }

    try {
        const { _id } = verifyToken(token);
        const hashPassword = await hash(password, 10);

        await User.findByIdAndUpdate(_id, { password: hashPassword });
        res.json({
            severity: "success",
            message: "Password has been reset successfully"
        });
    } catch (err) {
        console.error("Error in resetting password:", err);  // Debugging log
        return res.json({
            severity: "error",
            message: "Issue in changing the password"
        });
    }
};

const verifyAccount = async (req, res) => {
    const { token } = req.params;

    try {
        const { _id } = verifyToken(token);
        if (!_id) throw new Error("Invalid token");

        await User.findByIdAndUpdate(_id, { isVerified: true });
        res.send(verificationSuccessHtml("http://localhost:5173/auth/login"));
    } catch (err) {
        console.error("Verification failed:", err);  // Debugging log
        return res.json({
            severity: "error",
            message: "Unable to authenticate the user"
        });
    }
};

module.exports = { signup, login, forgetPassword, resetPassword, verifyAccount };
    