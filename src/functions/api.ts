import express, { Router, Request, Response } from "express";
import serverless from "serverless-http";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
app.use(cors());
app.use(express.json());

const router = Router();

router.post("/register", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    console.log("reg time");
    if (!email || !password) {
      return res.status(400).json({ error: "empty email or pass" });
    }

    const { data: existingUser, error: checkError } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "email need new" });
    }

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert([
        {
          email: email,
          password: password,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    return res.status(201).json({
      message: "success reg",
      user: newUser,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "server error" });
  }
});

router.post("/login", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    console.log("login try");
    if (!email || !password) {
      return res.status(400).json({ error: "empty email or pass" });
    }

    const { data: user, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "invalid email or password" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        lastLoginAt: new Date().toISOString(),
      })
      .eq("id", user.id);

    console.log("update time");
    if (updateError) {
      console.error("update error lastLoginAt:", updateError.message);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(200).json({
      message: "success login",
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "server error" });
  }
});

router.get("/users", async (req: Request, res: Response): Promise<any> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { data: users, error: fetchError } = await supabase
      .from("users")
      .select("id, email, status, lastLoginAt")
      .order("id", { ascending: true });

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError.message);
      return res.status(400).json({ error: fetchError.message });
    }

    return res.status(200).json(users);
  } catch (error) {
    console.error("Server error inside /users:", error);
    return res.status(500).json({ error: "server error" });
  }
});

router.post(
  "/users/delete",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      try {
        jwt.verify(token, JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ error: "No user IDs provided or invalid format" });
      }

      const { error: deleteError } = await supabase
        .from("users")
        .delete()
        .in("id", ids);

      if (deleteError) {
        console.error("Supabase delete error:", deleteError.message);
        return res.status(400).json({ error: deleteError.message });
      }

      return res
        .status(200)
        .json({ message: "Users successfully deleted", deletedIds: ids });
    } catch (error) {
      console.error("Server error inside /users/delete:", error);
      return res.status(500).json({ error: "server error" });
    }
  }
);

router.post(
  "/users/block",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
      }

      const token = authHeader.split(" ")[1];
      try {
        jwt.verify(token, JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No user IDs provided" });
      }

      const { error: blockError } = await supabase
        .from("users")
        .update({ status: "blocked" })
        .in("id", ids);

      if (blockError) {
        console.error("Supabase block error:", blockError.message);
        return res.status(400).json({ error: blockError.message });
      }

      return res
        .status(200)
        .json({ message: "Users successfully blocked", blockedIds: ids });
    } catch (error) {
      console.error("Server error inside /users/block:", error);
      return res.status(500).json({ error: "server error" });
    }
  }
);

app.use("/.netlify/functions/api", router);

export const handler = serverless(app);
