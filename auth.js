import express from "express"
import bodyParser from "body-parser"
import bcrypt from "bcrypt"
import crypto from "crypto"
import dateJs from "date.js"
import { MongoClient } from "mongodb"
import dotenv from "dotenv"

dotenv.config()

const AuthApp = express.Router()

const mongoClient = new MongoClient(process.env.MONGO_URL)
const users = mongoClient.db("Auth").collection("users")
const sessions = mongoClient.db("Auth").collection("sessions")
const notes = mongoClient.db("Data").collection("notes")

async function authorized(req,res,next){
    if(req.headers.cookie){
        let sessionId = req.headers.cookie.split('=')[1]
        let user = await sessions.findOne({[sessionId] : {'$exists': true}})
        if(user){
            req.user = user[sessionId]
            req.notes = await notes.find({username : req.user.username}).toArray()
            next()
        }
        else{
        res.render("login",{msg : "Please login again"})
        }
    }
    else
        res.render("login",{msg : "Please login"})
}

AuthApp.get('/login', (req, res) => {
    res.render("login", { msg: "" })
})

AuthApp.post('/login', bodyParser.urlencoded({ extended: false }), async (req, res) => {
    let uname = req.body.username
    let password = req.body.password

    //Authenticate
    if (uname && password) {
        let user = await users.findOne({ username: uname })
        if (user && uname === user.username && bcrypt.compare(password, user.password)){
            let sessionId = crypto.randomUUID()
            sessions.insertOne({
                [sessionId] : user,
                expires : dateJs("10 mins from now")
            }).then(()=>{
                res.setHeader("Set-Cookie",`session=${sessionId};expires=${dateJs("10 mins from now").toUTCString()};HtppOnly`)
                res.redirect("Home")
            }).catch(()=>{
                res.status(500).send("Internal server error!")
            })
        }
        else
            res.render("login", { msg: "Username or password is incorrect. Try again !" });
    }
    else {
        res.status(400).send("Try again!")
    }
})

AuthApp.get('/logout',authorized,async (req,res)=>{
    let sessionId = req.headers.cookie.split('=')[1]
    sessions.deleteOne({[sessionId] : {'$exists':true}}).then(()=>{
        res.setHeader('Set-Cookie',`session=;path=/;domain=${req.get('host')};expires=${dateJs("midnight 50 year ago").toUTCString()}`)
        res.redirect("/login")
    }).catch(()=>{
        console.log("Error logging out")
    })
})

AuthApp.get('/register', (req, res) => {
    res.render("register", { msg: "" })
})

AuthApp.post('/register', bodyParser.urlencoded({ extended: false }), async (req, res) => {
    let uname = req.body.username
    let fname = req.body.fname
    let lname = req.body.lname
    let password = req.body.password

    if (uname && password && fname && lname) {
        users.insertOne({
            username: uname,
            fname: fname,
            lname: lname,
            password: await bcrypt.hash(password,1)
        }).then(() => {
            res.render("login", { msg: "Login with new username & password"})
        }).catch((err) => {
            res.render("register", { msg: "Username taken, plese use a different one" })
        })
    }
    else
        res.render("register", { msg: "Something went wrong.Try again !"})
})

async function clearSessions(){
    let removed = await sessions.deleteMany({expires : {$lte : dateJs("now")}})
    console.log(removed)
}

//2 mins
setInterval(clearSessions,1000*60*5)

export default AuthApp
export {AuthApp,authorized}