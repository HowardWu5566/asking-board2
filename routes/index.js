const express = require('express')
const userController = require('../controllers/user-controller')
const router = express.Router()

router.post('/api/v1/signup', userController.signUp)

router.post('/api/v1/users/login', userController.login)

// router.get('/', (req, res) => {
//   res.send('routes')
// })

module.exports = router
