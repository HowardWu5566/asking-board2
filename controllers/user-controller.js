const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { User, Question, Reply, Like, Followship, sequelize } = require('../models')

const userController = {
  // 註冊
  signUp: async (req, res, next) => {
    try {
      const { name, email, password, confirmPassword, role } = req.body
      const messages = []
      const userEmail = await User.findOne({ where: { email } })
      if (userEmail) messages.push({ msg: 'email已重複註冊！' })
      if (!name.trim()) messages.push({ msg: '名稱不可空白！' })
      if (!email.trim()) messages.push({ msg: '名稱不可空白！' })
      if (password !== confirmPassword)
        messages.push({ msg: '密碼與確認密碼不符！' })
      if (messages.length) {
        return res.status(422).json({
          status: 'error',
          messages,
          name,
          email,
          role
        })
      }

      // 建立資料
      const newUser = await User.create({
        name,
        email,
        password: bcrypt.hashSync(password, 10),
        role
      })

      // 刪除敏感資訊、傳回客戶端
      delete newUser.dataValues.password
      return res.json({ status: 'success', user: newUser.dataValues })
    } catch (error) {
      next(error)
    }
  },

  // 登入
  login: async (req, res, next) => {
    try {
      // 檢查信箱及密碼
      const { email, password } = req.body
      const userData = await User.findOne({
        where: { email },
        attributes: ['id', 'name', 'email', 'password', 'role', 'avatar']
      })
      const isPassordCorrect = await bcrypt.compare(password, userData.password)
      if (!userData || !isPassordCorrect)
        return res
          .status(401)
          .json({ status: 'error', message: 'email or password incorrect' })

      // 製作 token
      const user = userData.toJSON()
      delete user.password
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' })
      res.status(200).json({ token, user })
    } catch (error) {
      next(error)
    }
  },

  // 查看使用者
  getUser: async (req, res, next) => {
    try {
      const userId = Number(req.params.id)
      const user = await User.findByPk(userId, {
        attributes: [
          'id',
          'name',
          'role',
          'avatar',
          'introduction',

          // 發問數
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM Questions WHERE userId = User.id)'
            ),
            'questionCount'
          ],

          // 回覆數
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM Questions JOIN Replies ON Questions.id = Replies.questionId WHERE Questions.userId = User.id)'
            ),
            'replyCount'
          ],

          // 收到讚數
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM Questions JOIN Likes ON Questions.id = Likes.objectId WHERE Questions.userId = User.id) + ' +
                '(SELECT COUNT(*) FROM Replies JOIN Likes ON Replies.id = Likes.objectId WHERE Replies.userId = User.id)'
            ),
            'likedCount'
          ],

          // 多少人追蹤他
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM Followships WHERE followingId = User.id)'
            ),
            'followerCount'
          ],

          // 他追蹤多少人
          [
            sequelize.literal(
              '(SELECT COUNT(*) FROM Followships WHERE followerId = User.id)'
            ),
            'followingCount'
          ]
        ]
      })
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })
      return res.status(200).json(user)
    } catch (error) {
      next(error)
    }
  },

  // 查看使用者發問的問題
  getUserQuestions: async (req, res, next) => {
    try {
      const userId = req.params.id

      // 確認使用者存在
      const user = await User.findByPk(userId)
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })

      const questions = await Question.findAll({
        attributes: [
          'id',
          'userId',
          'description',
          'grade',
          'subject',
          'createdAt'
        ],
        where: { userId, isAnonymous: false } // 不顯示匿名發問
      })
      console.log(questions)
      return res.status(200).json(questions)
    } catch (error) {
      next(error)
    }
  },

  getUserReplies: async (req, res, next) => {
    try {
      const userId = req.params.id

      // 確認使用者存在
      const user = await User.findByPk(userId)
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })

      const replies = await Reply.findAll({
        attributes: ['id', 'questionId', 'comment', 'createdAt'],
        include: {
          model: Question,
          attributes: ['id', 'description', 'grade', 'subject']
        },
        where: { userId }
      })

      // 處理過長的問題
      replies.forEach(reply => {
        reply.Question.description =
          reply.Question.description.slice(0, 20) + '...'
      })

      return res.status(200).json(replies)
    } catch (error) {
      next(error)
    }
  },

  // 查看使用者按讚的問題及回覆
  getUserLikes: async (req, res, next) => {
    try {
      const userId = Number(req.params.id)

      // 確認使用者存在
      const user = await User.findByPk(userId)
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })

      const likes = await Like.findAll({
        attributes: ['id', 'object', 'objectId', 'createdAt'],
        include: [
          {
            model: Question,
            attributes: ['id', 'description', 'isAnonymous', 'grade', 'subject'],
            include: {
              model: User,
              attributes: ['id', 'name', 'role', 'avatar']
            }
          },
          {
            model: Reply,
            attributes: ['id', 'questionId', 'comment', 'createdAt'],
            include: {
              model: User,
              attributes: ['id', 'name', 'role', 'avatar']
            }
          }
        ],
        where: { userId }
      })

      // 問題匿名處理
      likes.forEach(like => {
        if (like.Question && like.Question.dataValues.isAnonymous) {
          like.Question.dataValues.User = {
            name: '匿名',
            avatar: 'https://i.imgur.com/YOTISNv.jpg'
          }
        }
      })
      
      return res.status(200).json(likes)
    } catch (error) {
      next(error)
    }
  },

  // 查看誰追蹤他
  getUserFollowers: async (req, res, next) => {
    try {
      const userId = Number(req.params.id)

      // 確認使用者存在
      const user = await User.findByPk(userId)
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })

      let followers = await Followship.findAll({
        attributes: [],
        include: {
          model: User,
          as: 'followers',
          attributes: ['id', 'name', 'role', 'avatar']
        },
        where: { followingId: userId }
      })

      // 改變回傳資料結構，方便前端串接
      const followerData = followers.map(
        follower => follower.followers.dataValues
      )

      return res.status(200).json(followerData)
    } catch (error) {
      next(error)
    }
  },

  // 查看他追蹤誰
  getUserFollowings: async (req, res, next) => {
    try {
      const userId = Number(req.params.id)

      // 確認使用者存在
      const user = await User.findByPk(userId)
      if (!user || user.role === 'admin')
        return res
          .status(404)
          .json({ status: 404, message: "user doesn't exist!" })

      let followings = await Followship.findAll({
        attributes: [],
        include: {
          model: User,
          as: 'followings',
          attributes: ['id', 'name', 'role', 'avatar']
        },
        where: { followerId: userId }
      })

      // 改變回傳資料結構，方便前端串接
      const followingData = followings.map(
        following => following.followings.dataValues
      )

      return res.status(200).json(followingData)
    } catch (error) {
      next(error)
    }
  }
}

module.exports = userController
